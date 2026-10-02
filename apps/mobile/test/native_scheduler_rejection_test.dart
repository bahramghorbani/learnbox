// LB-B35 CP10 (D16): a deterministic server scheduler refusal must be terminal
// on native clients.
//
// The server boundary answers a deterministic scheduler refusal with HTTP 422
// and the exact body `{"error":"schedulerRejected"}`, while a transient fault is
// HTTP 503 `serverUnavailable` (see `apps/website/lib/mobile-review-http.ts`).
// Retrying a `schedulerRejected` request can never succeed, so the native client
// must not classify it as transient.
//
// These tests pin the classification at both layers: the transport (which maps
// an HTTP status to a typed exception) and the coordinator/queue boundary (which
// maps that exception to a `ReviewSyncResult` without discarding queued work).

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/sync/http_review_sync_transport.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/review_sync_coordinator.dart';
import 'package:learnbox/features/sync/review_sync_result.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

void main() {
  // ---------------------------------------------------------------------------
  // Transport layer: HTTP status/body -> typed exception classification.
  // ---------------------------------------------------------------------------

  test('422 schedulerRejected is a deterministic non-retryable transport error',
      () async {
    final transport = _transportReturning(const MobileReviewHttpResponse(
      statusCode: 422,
      body: '{"error":"schedulerRejected"}',
    ));

    await expectLater(
      () => transport.upload([_event()]),
      throwsA(isA<MobileReviewTransportException>()
          .having((error) => error.code, 'code', 'schedulerRejected')
          .having((error) => error.retryable, 'retryable', isFalse)),
    );
  });

  test('503 serverUnavailable remains a retryable transport error', () async {
    final transport = _transportReturning(const MobileReviewHttpResponse(
      statusCode: 503,
      body: '{"error":"serverUnavailable"}',
    ));

    await expectLater(
      () => transport.upload([_event()]),
      throwsA(isA<MobileReviewTransportException>()
          .having((error) => error.code, 'code', 'serverUnavailable')
          .having((error) => error.retryable, 'retryable', isTrue)),
    );
  });

  // Only the exact deterministic contract is terminal. Anything else keeps the
  // pre-existing retryable classification, so an unexpected 422 shape can never
  // strand a learner answer.
  for (final body in <String>[
    '{"error":"serverUnavailable"}',
    '{"error":"validation"}',
    '{"error":"schedulerrejected"}',
    '{"error":"schedulerRejected","extra":1}',
    '{"outcomes":[]}',
    'not json',
    '',
  ]) {
    test('422 with non-contract body "$body" stays retryable', () async {
      final transport = _transportReturning(MobileReviewHttpResponse(
        statusCode: 422,
        body: body,
      ));

      await expectLater(
        () => transport.upload([_event()]),
        throwsA(isA<MobileReviewTransportException>()
            .having((error) => error.code, 'code', 'serverUnavailable')
            .having((error) => error.retryable, 'retryable', isTrue)),
      );
    });
  }

  // A deterministic refusal is specific to the scheduler-bearing POST. The
  // read-only reconciliation GET never invokes the scheduler, so its
  // classification must not change.
  test('reconciliation GET 422 remains retryable serverUnavailable', () async {
    final transport = _transportReturning(
      const MobileReviewHttpResponse(
        statusCode: 422,
        body: '{"error":"schedulerRejected"}',
      ),
      reconciliation: true,
    );

    await expectLater(
      () => transport.readReconciliation(),
      throwsA(isA<MobileReviewTransportException>()
          .having((error) => error.code, 'code', 'serverUnavailable')
          .having((error) => error.retryable, 'retryable', isTrue)),
    );
  });

  // Pre-existing classifications must not regress.
  test('missing session still reports authenticationRequired', () async {
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(null),
      client: _FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"outcomes":[]}',
      )),
      endpoint: Uri.parse('https://learnbox.example/api/reviews/mobile'),
    );

    await expectLater(
      () => transport.upload([_event()]),
      throwsA(isA<MobileReviewTransportException>()
          .having((error) => error.code, 'code', 'authenticationRequired')),
    );
  });

  test('oversized batch still reports validation', () async {
    final transport = _transportReturning(const MobileReviewHttpResponse(
      statusCode: 200,
      body: '{"outcomes":[]}',
    ));

    await expectLater(
      () => transport.upload(
        List.generate(21, (index) => _event(id: 'event-$index')),
      ),
      throwsA(isA<MobileReviewTransportException>()
          .having((error) => error.code, 'code', 'validation')),
    );
  });

  test('malformed 200 body still reports validation', () async {
    final transport = _transportReturning(const MobileReviewHttpResponse(
      statusCode: 200,
      body: '{"unexpected":[]}',
    ));

    await expectLater(
      () => transport.upload([_event()]),
      throwsA(isA<MobileReviewTransportException>()
          .having((error) => error.code, 'code', 'validation')),
    );
  });

  test('network/transient transport failure classification is unchanged',
      () async {
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(_session),
      client: _ThrowingClient(),
      endpoint: Uri.parse('https://learnbox.example/api/reviews/mobile'),
    );

    await expectLater(
      () => transport.upload([_event()]),
      throwsA(isA<SocketishException>()),
    );
  });

  test('successful upload behaviour is unchanged', () async {
    final transport = _transportReturning(const MobileReviewHttpResponse(
      statusCode: 200,
      body: '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1",'
          '"eventId":"server-1","idempotent":false,'
          '"reconciliationCursor":"7"}]}',
    ));

    final response = await transport.upload([_event()]);

    expect(response.acknowledgedClientEventIds, ['event-1']);
    expect(response.reconciliationCursor, '7');
  });

  // ---------------------------------------------------------------------------
  // Coordinator/queue boundary: typed exception -> result, queue preserved.
  // ---------------------------------------------------------------------------

  test('deterministic rejection is terminal and keeps the learner answer',
      () async {
    final queue = await _queueWithEvents(2);
    final transport = _RejectingTransport.schedulerRejected();

    final result = await _coordinator(queue, transport).synchronize();

    expect(result, isA<SchedulerRejected>());
    expect(result, isNot(isA<RetryableFailure>()));
    expect((result as SchedulerRejected).remainingCount, 2);
    // The unsynced answers survive: a terminal refusal must never silently
    // discard queued learner work.
    expect(
      (await queue.pendingEvents()).map((event) => event.clientEventId),
      ['event-0', 'event-1'],
    );
  });

  test('repeated deterministic rejection causes no retry or backoff churn',
      () async {
    final queue = await _queueWithEvents(2);
    final transport = _RejectingTransport.schedulerRejected();
    final coordinator = _coordinator(queue, transport);

    for (var attempt = 0; attempt < 3; attempt += 1) {
      final result = await coordinator.synchronize();
      expect(result, isA<SchedulerRejected>());
    }

    // Exactly one upload per explicit user-initiated call: the coordinator
    // never retries internally and never arms a backoff timer.
    expect(transport.uploadCalls, 3);
    expect(await queue.pendingCount(), 2);
  });

  test('concurrent synchronize calls share one terminal rejection', () async {
    final queue = await _queueWithEvents(2);
    final transport = _RejectingTransport.schedulerRejected();
    final coordinator = _coordinator(queue, transport);

    // The in-flight dedupe must collapse concurrent callers onto a single
    // request even when that request ends in a terminal refusal, and the
    // completed future must clear so a later call can still run.
    final results = await Future.wait([
      coordinator.synchronize(),
      coordinator.synchronize(),
      coordinator.synchronize(),
    ]);

    expect(results, everyElement(isA<SchedulerRejected>()));
    expect(transport.uploadCalls, 1);
    expect(await queue.pendingCount(), 2);

    // _inFlight was released despite the terminal result.
    expect(await coordinator.synchronize(), isA<SchedulerRejected>());
    expect(transport.uploadCalls, 2);
    expect(await queue.pendingCount(), 2);
  });

  test('transient 503 still yields a retryable failure with work retained',
      () async {
    final queue = await _queueWithEvents(2);
    final transport = _RejectingTransport.serverUnavailable();

    final result = await _coordinator(queue, transport).synchronize();

    expect(result, isA<RetryableFailure>());
    expect(result, isNot(isA<SchedulerRejected>()));
    expect((result as RetryableFailure).remainingCount, 2);
    expect(await queue.pendingCount(), 2);
  });

  test('unrelated transport failure still yields a retryable failure',
      () async {
    final queue = await _queueWithEvents(2);

    final result = await _coordinator(queue, _RejectingTransport.validation())
        .synchronize();

    expect(result, isA<RetryableFailure>());
    expect(await queue.pendingCount(), 2);
  });

  test('successful coordinator sync behaviour is unchanged', () async {
    final queue = await _queueWithEvents(2);
    final transport = _AcknowledgingTransport();

    final result = await _coordinator(queue, transport).synchronize();

    expect(
      result,
      isA<Synchronized>()
          .having((value) => value.acknowledgedCount, 'acknowledged', 2)
          .having((value) => value.remainingCount, 'remaining', 0),
    );
    expect(await queue.pendingCount(), 0);
  });

  // ---------------------------------------------------------------------------
  // Native binary review must stay disabled: CP10 changes error handling only.
  // ---------------------------------------------------------------------------

  test('native payload stays legacy four-grade with no binary response',
      () async {
    final transport = _transportReturning(const MobileReviewHttpResponse(
      statusCode: 200,
      body: '{"outcomes":[]}',
    ));

    await transport.upload([_event()]);
    final sent = (transport.client as _FakeClient).body!;
    final items = sent['items'] as List<Object?>;
    final item = items.single as Map<String, Object?>;

    expect(
        item.keys.toSet(), {'clientEventId', 'cardId', 'grade', 'occurredAt'});
    expect(item.containsKey('response'), isFalse);
    expect(item['grade'], 'remembered');
    expect(ReviewGrade.values.map((grade) => grade.name),
        ['forgot', 'hard', 'remembered', 'mastered']);
  });
}

// -----------------------------------------------------------------------------
// Harness
// -----------------------------------------------------------------------------

const _session = MobileSession(
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  sessionId: 'session-id',
);

PendingReviewEvent _event({String id = 'event-1'}) => PendingReviewEvent(
      clientEventId: id,
      cardId: 'start-a1-haus',
      grade: ReviewGrade.remembered,
      occurredAt: DateTime.utc(2026, 8, 24, 12),
    );

_ProbeTransport _transportReturning(
  MobileReviewHttpResponse response, {
  bool reconciliation = false,
}) {
  final client = _FakeClient(response);
  return _ProbeTransport(
    client: client,
    transport: HttpReviewSyncTransport(
      sessionStore: _FakeStore(_session),
      client: client,
      endpoint: Uri.parse('https://learnbox.example/api/reviews/mobile'),
      reconciliationEndpoint: reconciliation
          ? Uri.parse('https://learnbox.example/api/reviews/mobile')
          : null,
    ),
  );
}

/// Thin delegate that exposes the fake client for payload assertions.
class _ProbeTransport
    implements ReviewSyncTransport, ReviewReconciliationTransport {
  _ProbeTransport({required this.client, required this.transport});

  final MobileReviewHttpClient client;
  final HttpReviewSyncTransport transport;

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) =>
      transport.upload(events, reconciliationCursor: reconciliationCursor);

  @override
  Future<ReviewReconciliationPage> readReconciliation({String? after}) =>
      transport.readReconciliation(after: after);
}

Future<ReviewQueue> _queueWithEvents(int count) async {
  var nextId = 0;
  final queue = ReviewQueue(
    store: _MemoryStore(),
    idFactory: () => 'event-${nextId++}',
  );
  for (var index = 0; index < count; index += 1) {
    await queue.record(
      'start-a1-card-$index',
      ReviewGrade.remembered,
      DateTime.utc(2026, 8, 13, 9, index),
    );
  }
  return queue;
}

ReviewSyncCoordinator _coordinator(
  ReviewQueue queue,
  ReviewSyncTransport transport,
) =>
    ReviewSyncCoordinator(
      queue: queue,
      identityState: () => MobileIdentityState.authenticated,
      transport: transport,
    );

class _RejectingTransport implements ReviewSyncTransport {
  _RejectingTransport(this.code);

  _RejectingTransport.schedulerRejected() : code = 'schedulerRejected';
  _RejectingTransport.serverUnavailable() : code = 'serverUnavailable';
  _RejectingTransport.validation() : code = 'validation';

  final String code;
  int uploadCalls = 0;

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async {
    uploadCalls += 1;
    throw MobileReviewTransportException(code);
  }
}

class _AcknowledgingTransport implements ReviewSyncTransport {
  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async =>
      ReviewUploadResponse(
        acknowledgedClientEventIds:
            events.map((event) => event.clientEventId).toList(growable: false),
        reconciliationCursor: '9',
      );
}

class _FakeStore implements MobileSessionStore {
  _FakeStore(this.value);
  final MobileSession? value;

  @override
  Future<MobileSession?> read() async => value;

  @override
  Future<void> write(MobileSession session) async {}

  @override
  Future<void> clear() async {}
}

class _FakeClient implements MobileReviewHttpClient {
  _FakeClient(this.response);
  final MobileReviewHttpResponse response;
  Map<String, Object>? body;

  @override
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  }) async {
    this.body = body;
    return response;
  }

  @override
  Future<MobileReviewHttpResponse> getJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, String> queryParameters,
  }) async =>
      response;
}

/// Stands in for a genuine socket-level fault, which must propagate unchanged
/// rather than being reclassified by the new 422 handling.
class SocketishException implements Exception {
  const SocketishException();
}

class _ThrowingClient implements MobileReviewHttpClient {
  @override
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  }) async =>
      throw const SocketishException();

  @override
  Future<MobileReviewHttpResponse> getJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, String> queryParameters,
  }) async =>
      throw const SocketishException();
}

class _MemoryStore implements ReviewQueueStore {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serializedEvents) async {
    value = serializedEvents;
  }
}
