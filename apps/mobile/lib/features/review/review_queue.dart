import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'binary_response.dart';
import 'pending_review_event.dart';
import 'review_grade.dart';
import 'review_queue_store.dart';

typedef ReviewEventIdFactory = String Function();

/// Own one instance per stored queue within an app process.
///
/// Store mutations are serialized within this instance. Separate instances may
/// restore the same store across app lifecycles, but must not mutate that store
/// concurrently.
///
/// ## Durability contract (CP16 B-3)
///
/// Before CP16 any single unreadable byte destroyed the learner's entire offline
/// queue: an unknown `schemaVersion`, an extra envelope key, or one malformed
/// event all returned an empty list and immediately overwrote storage. An app
/// upgrade that added a field to the event format was therefore itself a
/// data-loss event.
///
/// The rules now are:
///
/// * **Salvage, never wholesale-delete.** Every event that parses is kept, in
///   order, even if a sibling event is malformed.
/// * **Never silently drop.** An entry that cannot be parsed is moved verbatim
///   into a quarantine list persisted alongside the queue, so the evidence
///   survives for diagnosis instead of vanishing.
/// * **Tolerate the future.** Unknown envelope keys, unknown event fields and a
///   `schemaVersion` this build does not know are all read on a best-effort
///   basis rather than treated as corruption.
/// * **Stay downgrade-safe while you can.** The envelope is written at the
///   lowest version that can faithfully represent its contents, so a queue an
///   older build could still read is not gratuitously bumped out of its reach.
class ReviewQueue {
  ReviewQueue({
    required ReviewQueueStore store,
    ReviewQueueStore? quarantineStore,
    ReviewEventIdFactory? idFactory,
  })  : _store = store,
        _quarantineStore = quarantineStore,
        _idFactory = idFactory ?? _secureEventId;

  /// Highest envelope version this build writes.
  static const _schemaVersion = 2;

  /// Envelope version written when the contents need nothing beyond v1 — keeps
  /// pre-CP16 builds able to read the queue after a downgrade.
  static const _legacySchemaVersion = 1;

  /// Cap on retained quarantine entries. Evidence is valuable but must not grow
  /// without bound on a device; the oldest entries are shed first.
  static const _maxQuarantineEntries = 50;

  final ReviewQueueStore _store;

  /// CP17 F3 — quarantine evidence lives in its OWN store, never in the queue
  /// envelope.
  ///
  /// A pre-CP16 build's `_load()` requires an envelope of exactly two keys and
  /// calls `_discardCorruptQueue()` otherwise, so smuggling a `quarantine` key
  /// into the envelope makes a downgraded build delete the learner's surviving
  /// valid reviews. Keeping the evidence beside the queue preserves forensics
  /// **and** keeps the envelope downgrade-readable whenever its contents are
  /// representable in v1.
  ///
  /// When no quarantine store is supplied the evidence is kept in memory for
  /// the lifetime of the queue only; it is never written into the envelope.
  final ReviewQueueStore? _quarantineStore;
  final ReviewEventIdFactory _idFactory;
  Future<void> _mutationTail = Future<void>.value();
  List<Object?> _quarantine = const [];

  Future<void> record(
    String cardId,
    ReviewGrade grade,
    DateTime occurredAt,
  ) async {
    if (cardId.trim().isEmpty) {
      throw ArgumentError.value(cardId, 'cardId', 'Must not be empty.');
    }

    await _serializeMutation(() async {
      final events = await _load();
      final id = _idFactory();
      if (id.trim().isEmpty ||
          events.any((event) => event.clientEventId == id)) {
        throw StateError('Review event ID must be non-empty and unique.');
      }

      await _write([
        ...events,
        PendingReviewEvent(
          clientEventId: id,
          cardId: cardId,
          grade: grade,
          occurredAt: occurredAt.toUtc(),
        ),
      ]);
    });
  }

  /// Record an explicit binary answer (CP16 / Decision A).
  ///
  /// The shadow grade is derived from [response], never supplied, so storage can
  /// never disagree with the learner's actual answer.
  Future<void> recordBinary(
    String cardId,
    BinaryResponse response,
    DateTime occurredAt,
  ) async {
    if (cardId.trim().isEmpty) {
      throw ArgumentError.value(cardId, 'cardId', 'Must not be empty.');
    }

    await _serializeMutation(() async {
      final events = await _load();
      final id = _idFactory();
      if (id.trim().isEmpty ||
          events.any((event) => event.clientEventId == id)) {
        throw StateError('Review event ID must be non-empty and unique.');
      }

      await _write([
        ...events,
        PendingReviewEvent.binary(
          clientEventId: id,
          cardId: cardId,
          response: response,
          occurredAt: occurredAt.toUtc(),
        ),
      ]);
    });
  }

  Future<int> pendingCount() =>
      _serializeMutation(() async => (await _load()).length);

  Future<List<PendingReviewEvent>> pendingEvents() => _serializeMutation(
        () async => List<PendingReviewEvent>.unmodifiable(await _load()),
      );

  /// Entries that could not be restored, retained verbatim for diagnosis.
  ///
  /// Non-empty means data was unreadable — never that it was discarded.
  Future<List<Object?>> quarantinedEntries() => _serializeMutation(() async {
        await _load();
        return List<Object?>.unmodifiable(_quarantine);
      });

  /// Retire events the server rejected terminally, preserving them as evidence.
  ///
  /// CP17 review finding H3. A terminally-rejected event must leave the pending
  /// queue — otherwise it is re-sent in every batch forever and head-of-line
  /// blocking survives the F1 salvage fix — but it must not simply vanish: the
  /// learner really answered, so the serialized event is moved into the
  /// quarantine evidence store. Uses the same mutation lock as [acknowledge] so
  /// a concurrent enqueue cannot be lost.
  Future<void> quarantineByClientEventId(Iterable<String> ids) async {
    final rejected = ids.toSet();
    if (rejected.isEmpty) return;
    await _serializeMutation(() async {
      final events = await _load();
      final kept = <PendingReviewEvent>[];
      final removed = <Object?>[];
      for (final event in events) {
        if (rejected.contains(event.clientEventId)) {
          removed.add(event.toJson());
        } else {
          kept.add(event);
        }
      }
      if (removed.isEmpty) return;
      _quarantine = _capQuarantine([..._quarantine, ...removed]);
      await _persistQuarantine();
      await _write(kept);
    });
  }

  Future<void> acknowledge(Iterable<String> ids) async {
    final acknowledged = ids.toSet();
    await _serializeMutation(() async {
      final events = await _load();
      await _write(
        events
            .where(
              (event) => !acknowledged.contains(event.clientEventId),
            )
            .toList(),
      );
    });
  }

  Future<T> _serializeMutation<T>(Future<T> Function() mutation) async {
    final predecessor = _mutationTail;
    final release = Completer<void>();
    _mutationTail = release.future;

    await predecessor;
    try {
      return await mutation();
    } finally {
      release.complete();
    }
  }

  Future<List<PendingReviewEvent>> _load() async {
    final serialized = await _store.read();
    if (serialized == null) {
      // Evidence from an earlier session must survive an empty queue.
      await _restoreQuarantine();
      return const [];
    }

    Object? decoded;
    try {
      decoded = jsonDecode(serialized);
    } catch (_) {
      // Not JSON at all: nothing can be salvaged, but the bytes are preserved
      // rather than overwritten with an empty queue.
      await _restoreQuarantine();
      return _quarantineWhole(serialized);
    }

    if (decoded is! Map<String, dynamic>) {
      await _restoreQuarantine();
      return _quarantineWhole(serialized);
    }
    final rawEvents = decoded['events'];
    if (rawEvents is! List<dynamic>) {
      await _restoreQuarantine();
      return _quarantineWhole(serialized);
    }

    final events = <PendingReviewEvent>[];
    final ids = <String>{};
    final rejected = <Object?>[];
    for (final value in rawEvents) {
      final event = PendingReviewEvent.fromJson(value);
      if (event == null || !ids.add(event.clientEventId)) {
        // One bad or duplicated entry quarantines ITSELF, not its neighbours.
        rejected.add(value);
        continue;
      }
      events.add(event);
    }

    // Start from evidence held in the side store, then migrate any evidence a
    // CP16-era build wrote into the envelope itself (F3 forward migration), then
    // add what this load rejected.
    await _restoreQuarantine();
    _quarantine = _capQuarantine([
      ..._quarantine,
      ..._carriedQuarantine(decoded['quarantine']),
      ...rejected,
    ]);
    await _persistQuarantine();

    // Rewrite only when the stored form no longer matches what we restored, so
    // a healthy queue is never needlessly rewritten.
    if (rejected.isNotEmpty ||
        decoded.containsKey('quarantine') ||
        _needsRewrite(decoded, events)) {
      await _write(events);
    }
    return events;
  }

  List<Object?> _carriedQuarantine(Object? value) =>
      value is List<dynamic> ? List<Object?>.from(value) : const [];

  List<Object?> _capQuarantine(List<Object?> entries) =>
      entries.length <= _maxQuarantineEntries
          ? List<Object?>.unmodifiable(entries)
          : List<Object?>.unmodifiable(
              entries.sublist(entries.length - _maxQuarantineEntries),
            );

  bool _needsRewrite(
    Map<String, dynamic> decoded,
    List<PendingReviewEvent> events,
  ) {
    final version = decoded['schemaVersion'];
    // A version we do not recognise is read on a best-effort basis and then
    // normalised; an unknown FUTURE version is left alone so a newer build can
    // still use it if the learner upgrades again without reviewing meanwhile.
    if (version is int && version > _schemaVersion) return false;
    return version != _envelopeVersionFor(events);
  }

  /// Lowest version that faithfully represents [events].
  ///
  /// CP17 F3: bumped **only** when an event actually carries binary evidence.
  /// Quarantine no longer participates: it is stored outside the envelope, so a
  /// queue holding only legacy events stays v1-readable by a pre-CP16 build even
  /// while forensic evidence is retained.
  int _envelopeVersionFor(List<PendingReviewEvent> events) =>
      events.any((event) => event.hasExplicitBinaryResponse)
          ? _schemaVersion
          : _legacySchemaVersion;

  Future<List<PendingReviewEvent>> _quarantineWhole(String serialized) async {
    _quarantine = _capQuarantine([..._quarantine, serialized]);
    await _persistQuarantine();
    await _write(const []);
    return const [];
  }

  /// Persist quarantine evidence beside the queue, never inside its envelope.
  Future<void> _persistQuarantine() async {
    final store = _quarantineStore;
    if (store == null) return;
    await store.write(jsonEncode({'quarantine': _quarantine}));
  }

  Future<void> _restoreQuarantine() async {
    final store = _quarantineStore;
    if (store == null) return;
    final serialized = await store.read();
    if (serialized == null) return;
    try {
      final decoded = jsonDecode(serialized);
      if (decoded is Map<String, dynamic>) {
        _quarantine = _capQuarantine(_carriedQuarantine(decoded['quarantine']));
      }
    } catch (_) {
      // Unreadable evidence must never break queue loading.
    }
  }

  Future<void> _write(List<PendingReviewEvent> events) => _store.write(
        jsonEncode({
          'schemaVersion': _envelopeVersionFor(events),
          'events': events.map((event) => event.toJson()).toList(),
        }),
      );
}

String _secureEventId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  return base64UrlEncode(bytes).replaceAll('=', '');
}
