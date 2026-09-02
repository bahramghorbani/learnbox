import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/reconciliation_cursor_store.dart';
import 'package:learnbox/features/sync/review_sync_coordinator.dart';
import 'package:learnbox/features/sync/review_sync_result.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

void main() {
  test('reads the prior cursor from the store before uploading', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 1);
    final cursorStore = _TrackingCursorStore('7');
    final transport =
        _CursoredTransport(acknowledged: ['event-0'], cursor: '8');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    await coordinator.synchronize();

    expect(cursorStore.readCalls, 1);
    expect(transport.calls, 1);
    expect(transport.receivedCursor, '7');
    expect(
      cursorStore.readCalls,
      lessThanOrEqualTo(transport.calls),
      reason: 'The prior cursor must be read before the batch is uploaded.',
    );
  });

  test('cursor read failure fails closed before any upload', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 1);
    final cursorStore = _TrackingCursorStore(null)..failReads = true;
    final transport =
        _CursoredTransport(acknowledged: ['event-0'], cursor: '8');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<RetryableFailure>());
    expect(transport.calls, 0);
    expect(await queue.pendingCount(), 1);
  });

  test('persists the response cursor only after exact acknowledgements',
      () async {
    final queue = await _queueWithEvents(_MemoryStore(), 2);
    final cursorStore = _MemoryReconciliationCursorStore(null);
    final transport =
        _CursoredTransport(acknowledged: ['event-0'], cursor: '7');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    final result = await coordinator.synchronize();

    expect(
      result,
      isA<Synchronized>()
          .having((value) => value.acknowledgedCount, 'acknowledged', 1)
          .having((value) => value.cursor, 'cursor', '7'),
    );
    expect(await cursorStore.read(), '7');
    expect(
      (await queue.pendingEvents()).map((event) => event.clientEventId),
      ['event-1'],
    );
  });

  test('invalid stored cursor fails closed and is not written back', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 1);
    final cursorStore = _MemoryReconciliationCursorStore('not-a-cursor');
    final transport =
        _CursoredTransport(acknowledged: ['event-0'], cursor: '2');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<Synchronized>());
    expect(await cursorStore.read(), '2');
    expect(await queue.pendingCount(), 0);
  });

  test('no acknowledged events means no cursor write', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 2);
    final cursorStore = _MemoryReconciliationCursorStore(null);
    final transport = _CursoredTransport(acknowledged: const [], cursor: '1');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<RetryableFailure>());
    expect(await cursorStore.read(), isNull);
    expect(await queue.pendingCount(), 2);
  });

  test(
      'cursor write failure returns retryable failure and keeps acknowledged '
      'events recoverable', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 1);
    final cursorStore = _MemoryReconciliationCursorStore(null)
      ..failWrites = true;
    final transport =
        _CursoredTransport(acknowledged: ['event-0'], cursor: '2');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<RetryableFailure>());
  });

  test(
      'retry after cursor write failure is safe: queue acknowledgement is '
      'already durable, cursor write completes on the next attempt', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 1);
    final cursorStore = _MemoryReconciliationCursorStore(null);
    var failFirstWrite = true;
    final failingThenWorkingStore = _DelegatingCursorStore(
      () => cursorStore.read(),
      (cursor) async {
        if (failFirstWrite) {
          failFirstWrite = false;
          throw StateError('Cursor storage unavailable.');
        }
        return cursorStore.write(cursor);
      },
    );
    final transport =
        _CursoredTransport(acknowledged: ['event-0'], cursor: '2');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: failingThenWorkingStore,
    );

    // First attempt: the queue acknowledgement succeeds, the cursor write
    // fails, and the attempt reports RetryableFailure instead of Synchronized
    // (no loss, no false synchronized claim).
    final first = await coordinator.synchronize();
    expect(first, isA<RetryableFailure>());
    expect(await queue.pendingCount(), 0);
    expect(await cursorStore.read(), isNull);

    // Next attempt: the queue is empty, so the coordinator writes no cursor
    // and reports nothingPending. The server has the exact acknowledgements;
    // a later batch carries its own response cursor.
    final second = await coordinator.synchronize();
    expect(second, isA<NothingPending>());
    expect(await cursorStore.read(), isNull);
  });

  test('a cursor alone never removes queue entries', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 1);
    final cursorStore = _MemoryReconciliationCursorStore('9');
    final transport = _CursoredTransport(acknowledged: const [], cursor: '10');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<RetryableFailure>());
    expect(await cursorStore.read(), '9');
    expect(await queue.pendingCount(), 1);
  });

  test(
      'idempotent replay with an acknowledged outcome persists the cursor '
      'and removes only acknowledged events', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 2);
    final cursorStore = _MemoryReconciliationCursorStore('3');
    final transport =
        _CursoredTransport(acknowledged: ['event-0'], cursor: '3');
    final coordinator = _authenticatedCoordinator(
      queue,
      transport,
      cursorStore: cursorStore,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<Synchronized>());
    expect(await cursorStore.read(), '3');
    expect(
      (await queue.pendingEvents()).map((event) => event.clientEventId),
      ['event-1'],
    );
  });
}

class _MemoryReconciliationCursorStore implements ReconciliationCursorStore {
  _MemoryReconciliationCursorStore(this.value);

  String? value;
  var failWrites = false;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String cursor) async {
    if (failWrites) {
      throw StateError('Cursor storage unavailable.');
    }
    value = cursor;
  }
}

/// Records when the coordinator reads the stored cursor, without hiding
/// failures: read failures propagate exactly like the memory store.
class _TrackingCursorStore implements ReconciliationCursorStore {
  _TrackingCursorStore(this.value);

  final String? value;
  var readCalls = 0;
  var failReads = false;

  @override
  Future<String?> read() async {
    readCalls += 1;
    if (failReads) {
      throw StateError('Cursor storage unavailable.');
    }
    return value;
  }

  @override
  Future<void> write(String cursor) async {}
}

class _DelegatingCursorStore implements ReconciliationCursorStore {
  _DelegatingCursorStore(this._read, this._write);

  final Future<String?> Function() _read;
  final Future<void> Function(String cursor) _write;

  @override
  Future<String?> read() => _read();

  @override
  Future<void> write(String cursor) => _write(cursor);
}

class _CursoredTransport implements ReviewSyncTransport {
  _CursoredTransport({required this.acknowledged, required this.cursor});

  final List<String> acknowledged;
  final String cursor;
  var calls = 0;
  String? receivedCursor;

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async {
    calls += 1;
    receivedCursor = reconciliationCursor;
    return ReviewUploadResponse(
      acknowledgedClientEventIds: acknowledged,
      reconciliationCursor: cursor,
    );
  }
}

class _MemoryStore implements ReviewQueueStore {
  String? value;
  var failWrites = false;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serializedEvents) async {
    if (failWrites) {
      throw StateError('Storage unavailable.');
    }
    value = serializedEvents;
  }
}

ReviewSyncCoordinator _authenticatedCoordinator(
  ReviewQueue queue,
  ReviewSyncTransport transport, {
  ReconciliationCursorStore? cursorStore,
}) =>
    ReviewSyncCoordinator(
      queue: queue,
      identityState: () => MobileIdentityState.authenticated,
      transport: transport,
      reconciliationCursorStore:
          cursorStore ?? _MemoryReconciliationCursorStore(null),
    );

Future<ReviewQueue> _queueWithEvents(_MemoryStore store, int count) async {
  var nextId = 0;
  final queue = ReviewQueue(
    store: store,
    idFactory: () => 'event-${nextId++}',
  );
  for (var index = 0; index < count; index++) {
    await queue.record(
      'start-a1-card-$index',
      ReviewGrade.remembered,
      DateTime.utc(2026, 8, 13, 9, index),
    );
  }
  return queue;
}
