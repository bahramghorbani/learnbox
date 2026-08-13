import 'dart:convert';
import 'dart:math';

import 'pending_review_event.dart';
import 'review_grade.dart';
import 'review_queue_store.dart';

typedef ReviewEventIdFactory = String Function();

class ReviewQueue {
  ReviewQueue({
    required ReviewQueueStore store,
    ReviewEventIdFactory? idFactory,
  })  : _store = store,
        _idFactory = idFactory ?? _secureEventId;

  static const _schemaVersion = 1;

  final ReviewQueueStore _store;
  final ReviewEventIdFactory _idFactory;

  Future<void> record(
    String cardId,
    ReviewGrade grade,
    DateTime occurredAt,
  ) async {
    if (cardId.trim().isEmpty) {
      throw ArgumentError.value(cardId, 'cardId', 'Must not be empty.');
    }

    final events = await _load();
    final id = _idFactory();
    if (id.trim().isEmpty || events.any((event) => event.id == id)) {
      throw StateError('Review event ID must be non-empty and unique.');
    }

    await _write([
      ...events,
      PendingReviewEvent(
        id: id,
        cardId: cardId,
        grade: grade,
        occurredAt: occurredAt.toUtc(),
      ),
    ]);
  }

  Future<int> pendingCount() async => (await _load()).length;

  Future<void> acknowledge(Iterable<String> ids) async {
    final acknowledged = ids.toSet();
    final events = await _load();
    await _write(
      events.where((event) => !acknowledged.contains(event.id)).toList(),
    );
  }

  Future<List<PendingReviewEvent>> _load() async {
    final serialized = await _store.read();
    if (serialized == null) {
      return const [];
    }

    try {
      final decoded = jsonDecode(serialized);
      if (decoded is! Map<String, dynamic> ||
          decoded.length != 2 ||
          decoded['schemaVersion'] != _schemaVersion ||
          decoded['events'] is! List<dynamic>) {
        return _discardCorruptQueue();
      }

      final events = <PendingReviewEvent>[];
      final ids = <String>{};
      for (final value in decoded['events'] as List<dynamic>) {
        final event = PendingReviewEvent.fromJson(value);
        if (event == null || !ids.add(event.id)) {
          return _discardCorruptQueue();
        }
        events.add(event);
      }
      return events;
    } catch (_) {
      return _discardCorruptQueue();
    }
  }

  Future<List<PendingReviewEvent>> _discardCorruptQueue() async {
    await _write(const []);
    return const [];
  }

  Future<void> _write(List<PendingReviewEvent> events) => _store.write(
        jsonEncode({
          'schemaVersion': _schemaVersion,
          'events': events.map((event) => event.toJson()).toList(),
        }),
      );
}

String _secureEventId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  return base64UrlEncode(bytes).replaceAll('=', '');
}
