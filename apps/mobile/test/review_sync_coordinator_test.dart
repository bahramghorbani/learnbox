import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/review_sync_coordinator.dart';
import 'package:learnbox/features/sync/review_sync_result.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

void main() {
  test('signed-out synchronization does not read the queue or call transport',
      () async {
    final transport = _RecordingTransport();
    final coordinator = ReviewSyncCoordinator(
      queue: ReviewQueue(store: _ThrowingStore()),
      identityState: () => MobileIdentityState.signedOut,
      transport: transport,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<AuthenticationRequired>());
    expect(transport.calls, 0);
  });

  test('authenticated empty queue does not call transport', () async {
    final transport = _RecordingTransport();
    final coordinator = ReviewSyncCoordinator(
      queue: ReviewQueue(store: _MemoryStore()),
      identityState: () => MobileIdentityState.authenticated,
      transport: transport,
    );

    final result = await coordinator.synchronize();

    expect(result, isA<NothingPending>());
    expect(transport.calls, 0);
  });

  test('uploads the first twenty pending events in persisted order', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 21);
    final transport = _RecordingTransport.acknowledgingAll();

    final result =
        await _authenticatedCoordinator(queue, transport).synchronize();

    expect(transport.uploadedIds, List.generate(20, (index) => 'event-$index'));
    expect(
      result,
      isA<Synchronized>()
          .having((value) => value.acknowledgedCount, 'acknowledged', 20)
          .having((value) => value.remainingCount, 'remaining', 1),
    );
    expect(await queue.pendingCount(), 1);
  });

  test('partial acknowledgement removes only confirmed events', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 3);
    final transport =
        _RecordingTransport.respondingWith(['event-0', 'event-2']);

    final result =
        await _authenticatedCoordinator(queue, transport).synchronize();

    expect(
      result,
      isA<Synchronized>()
          .having((value) => value.acknowledgedCount, 'acknowledged', 2)
          .having((value) => value.remainingCount, 'remaining', 1),
    );
    expect(
      (await queue.pendingEvents()).map((event) => event.clientEventId),
      ['event-1'],
    );
  });

  for (final invalidResponse in <List<String>>[
    const [],
    ['unknown'],
    ['event-0', 'event-0'],
  ]) {
    test('invalid acknowledgement $invalidResponse retains pending events',
        () async {
      final queue = await _queueWithEvents(_MemoryStore(), 2);
      final transport = _RecordingTransport.respondingWith(invalidResponse);

      final result =
          await _authenticatedCoordinator(queue, transport).synchronize();

      expect(result, isA<RetryableFailure>());
      expect(
        (await queue.pendingEvents()).map((event) => event.clientEventId),
        ['event-0', 'event-1'],
      );
    });
  }

  test('transport failure retains all pending events', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 2);

    final result = await _authenticatedCoordinator(queue, _ThrowingTransport())
        .synchronize();

    expect(result, isA<RetryableFailure>());
    expect(await queue.pendingCount(), 2);
  });

  test('acknowledgement storage failure retains all pending events', () async {
    final store = _MemoryStore();
    final queue = await _queueWithEvents(store, 2);
    store.failWrites = true;
    final transport = _RecordingTransport.acknowledgingAll();

    final result =
        await _authenticatedCoordinator(queue, transport).synchronize();

    expect(result, isA<RetryableFailure>());
    store.failWrites = false;
    expect(await ReviewQueue(store: store).pendingCount(), 2);
  });

  test('concurrent attempts share one in-flight upload', () async {
    final queue = await _queueWithEvents(_MemoryStore(), 1);
    final transport = _BlockingTransport();
    final coordinator = _authenticatedCoordinator(queue, transport);

    final firstAttempt = coordinator.synchronize();
    await transport.uploadStarted.future;
    final secondAttempt = coordinator.synchronize();

    expect(identical(firstAttempt, secondAttempt), isTrue);
    expect(transport.calls, 1);
    transport.completeWith(['event-0']);

    expect(await firstAttempt, isA<Synchronized>());
    expect(await secondAttempt, isA<Synchronized>());
  });
}

class _RecordingTransport implements ReviewSyncTransport {
  _RecordingTransport() : _acknowledgedIds = const [];

  _RecordingTransport.respondingWith(this._acknowledgedIds);

  _RecordingTransport.acknowledgingAll() : _acknowledgedIds = null;

  final List<String>? _acknowledgedIds;
  var calls = 0;
  List<String> uploadedIds = const [];

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async {
    calls += 1;
    uploadedIds = List.unmodifiable(
      events.map((event) => event.clientEventId).toList(),
    );
    return ReviewUploadResponse(
      acknowledgedClientEventIds: _acknowledgedIds ?? uploadedIds,
    );
  }
}

class _ThrowingTransport implements ReviewSyncTransport {
  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) =>
      throw StateError('Transport unavailable.');
}

class _BlockingTransport implements ReviewSyncTransport {
  var calls = 0;
  final uploadStarted = Completer<void>();
  final _response = Completer<ReviewUploadResponse>();

  void completeWith(List<String> ids) {
    _response.complete(ReviewUploadResponse(acknowledgedClientEventIds: ids));
  }

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async {
    calls += 1;
    uploadStarted.complete();
    return _response.future;
  }
}

class _ThrowingStore implements ReviewQueueStore {
  @override
  Future<String?> read() => throw StateError('Queue must not be read.');

  @override
  Future<void> write(String serializedEvents) =>
      throw StateError('Queue must not be written.');
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
  ReviewSyncTransport transport,
) =>
    ReviewSyncCoordinator(
      queue: queue,
      identityState: () => MobileIdentityState.authenticated,
      transport: transport,
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
