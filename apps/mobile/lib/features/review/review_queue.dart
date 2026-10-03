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
    ReviewEventIdFactory? idFactory,
  })  : _store = store,
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
      _quarantine = const [];
      return const [];
    }

    Object? decoded;
    try {
      decoded = jsonDecode(serialized);
    } catch (_) {
      // Not JSON at all: nothing can be salvaged, but the bytes are preserved
      // rather than overwritten with an empty queue.
      return _quarantineWhole(serialized);
    }

    if (decoded is! Map<String, dynamic>) {
      return _quarantineWhole(serialized);
    }
    final rawEvents = decoded['events'];
    if (rawEvents is! List<dynamic>) {
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

    final carried = _carriedQuarantine(decoded['quarantine']);
    _quarantine = _capQuarantine([...carried, ...rejected]);

    // Rewrite only when the stored form no longer matches what we restored, so
    // a healthy queue is never needlessly rewritten.
    if (rejected.isNotEmpty || _needsRewrite(decoded, events)) {
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
  /// Bumped only once an event actually carries binary evidence (or quarantine
  /// exists), so a queue a pre-CP16 build could still read stays at v1.
  int _envelopeVersionFor(List<PendingReviewEvent> events) =>
      _quarantine.isEmpty &&
              !events.any((event) => event.hasExplicitBinaryResponse)
          ? _legacySchemaVersion
          : _schemaVersion;

  Future<List<PendingReviewEvent>> _quarantineWhole(String serialized) async {
    _quarantine = _capQuarantine([..._quarantine, serialized]);
    await _write(const []);
    return const [];
  }

  Future<void> _write(List<PendingReviewEvent> events) => _store.write(
        jsonEncode({
          'schemaVersion': _envelopeVersionFor(events),
          'events': events.map((event) => event.toJson()).toList(),
          if (_quarantine.isNotEmpty) 'quarantine': _quarantine,
        }),
      );
}

String _secureEventId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  return base64UrlEncode(bytes).replaceAll('=', '');
}
