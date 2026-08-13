import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/secure_review_queue_store.dart';

void main() {
  test('record waits until the grade is durably stored', () async {
    final store = InMemoryReviewQueueStore.blockingWrites();
    final queue = ReviewQueue(store: store, idFactory: () => 'event-a');
    var recordReturned = false;

    final recordFuture = queue
        .record(
          'start-a1-haus',
          ReviewGrade.remembered,
          DateTime.parse('2026-08-13T12:34:56+03:30'),
        )
        .then((_) => recordReturned = true);

    await store.writeStarted.future;
    expect(recordReturned, isFalse);

    store.allowWrite();
    await recordFuture;

    final persisted = jsonDecode(store.value!) as Map<String, dynamic>;
    expect(persisted['schemaVersion'], 1);
    expect(persisted['events'], [
      {
        'id': 'event-a',
        'cardId': 'start-a1-haus',
        'grade': 'remembered',
        'occurredAt': '2026-08-13T09:04:56.000Z',
      },
    ]);
  });

  test('two records persist different injected client event IDs', () async {
    final store = InMemoryReviewQueueStore();
    final ids = ['event-a', 'event-b'].iterator;
    final queue = ReviewQueue(
      store: store,
      idFactory: () {
        ids.moveNext();
        return ids.current;
      },
    );

    await queue.record(
      'start-a1-haus',
      ReviewGrade.hard,
      DateTime.utc(2026, 8, 13, 9),
    );
    await queue.record(
      'start-a1-tisch',
      ReviewGrade.mastered,
      DateTime.utc(2026, 8, 13, 10),
    );

    expect(_persistedIds(store), ['event-a', 'event-b']);
  });

  test('a new queue instance restores pending events', () async {
    final store = InMemoryReviewQueueStore();
    final firstQueue = ReviewQueue(store: store, idFactory: () => 'event-a');
    await firstQueue.record(
      'start-a1-haus',
      ReviewGrade.forgot,
      DateTime.utc(2026, 8, 13, 9),
    );

    final restoredQueue = ReviewQueue(store: store);

    expect(await restoredQueue.pendingCount(), 1);
  });

  test('malformed stored structures fail closed and are overwritten', () async {
    const malformedValues = [
      '{not-json',
      '{"schemaVersion":2,"events":[]}',
      '{"schemaVersion":1,"events":['
          '{"id":"valid","cardId":"start-a1-haus","grade":"hard",'
          '"occurredAt":"2026-08-13T09:00:00.000Z"},'
          '{"id":"broken","cardId":"start-a1-tisch","grade":"unknown",'
          '"occurredAt":"2026-08-13T10:00:00.000Z"}'
          ']}',
    ];

    for (final malformed in malformedValues) {
      final store = InMemoryReviewQueueStore(initialValue: malformed);
      final queue = ReviewQueue(store: store);

      expect(await queue.pendingCount(), 0, reason: malformed);
      expect(jsonDecode(store.value!), {
        'schemaVersion': 1,
        'events': <Object?>[],
      });
    }
  });

  test('acknowledge removes only exact matching IDs', () async {
    final store = InMemoryReviewQueueStore();
    final ids = ['event-a', 'event-b', 'event-c'].iterator;
    final queue = ReviewQueue(
      store: store,
      idFactory: () {
        ids.moveNext();
        return ids.current;
      },
    );

    for (final cardId in ['start-a1-haus', 'start-a1-tisch', 'start-a1-tuer']) {
      await queue.record(
        cardId,
        ReviewGrade.remembered,
        DateTime.utc(2026, 8, 13, 9),
      );
    }

    await queue.acknowledge(['event-b', 'event-not-present']);

    expect(_persistedIds(store), ['event-a', 'event-c']);
    expect(await ReviewQueue(store: store).pendingCount(), 2);
  });

  test('secure adapter reads and writes only the review queue key', () async {
    FlutterSecureStorage.setMockInitialValues({
      'unrelated.key': 'keep-me',
    });
    const secureStorage = FlutterSecureStorage();
    final store = SecureReviewQueueStore(storage: secureStorage);

    await store.write('{"schemaVersion":1,"events":[]}');

    expect(
      await secureStorage.read(key: 'learnbox.reviewQueue.v1'),
      '{"schemaVersion":1,"events":[]}',
    );
    expect(await store.read(), '{"schemaVersion":1,"events":[]}');
    expect(await secureStorage.read(key: 'unrelated.key'), 'keep-me');
  });
}

List<String> _persistedIds(InMemoryReviewQueueStore store) {
  final root = jsonDecode(store.value!) as Map<String, dynamic>;
  final events = root['events'] as List<dynamic>;
  return events
      .map((event) => (event as Map<String, dynamic>)['id'] as String)
      .toList();
}

class InMemoryReviewQueueStore implements ReviewQueueStore {
  InMemoryReviewQueueStore({String? initialValue})
      : value = initialValue,
        _writeGate = null;

  InMemoryReviewQueueStore.blockingWrites()
      : _writeGate = Completer<void>(),
        value = null;

  String? value;
  final Completer<void> writeStarted = Completer<void>();
  final Completer<void>? _writeGate;

  void allowWrite() => _writeGate?.complete();

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serializedEvents) async {
    if (!writeStarted.isCompleted) {
      writeStarted.complete();
    }
    await _writeGate?.future;
    value = serializedEvents;
  }
}
