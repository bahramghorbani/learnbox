import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/sync/http_review_sync_transport.dart';

void main() {
  final event = PendingReviewEvent(
    clientEventId: 'event-1',
    cardId: 'start-a1-haus',
    grade: ReviewGrade.remembered,
    occurredAt: DateTime.utc(2026, 8, 24, 12),
  );
  const session = MobileSession(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    sessionId: 'session-id',
  );
  final endpoint = Uri.parse('https://learnbox.example/api/reviews/mobile');

  test('parses an acknowledged outcome with a decimal-string cursor', () async {
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(session),
      client: _FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body:
            '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":"42"}]}',
      )),
      endpoint: endpoint,
    );

    final result = await transport.upload([event]);

    expect(result.acknowledgedClientEventIds, ['event-1']);
    expect(result.reconciliationCursor, '42');
  });

  test('does not return a cursor when no outcome is acknowledged', () async {
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(session),
      client: _FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body:
            '{"outcomes":[{"status":"validation","clientEventId":"event-1"}]}',
      )),
      endpoint: endpoint,
    );

    final result = await transport.upload([event]);

    expect(result.acknowledgedClientEventIds, isEmpty);
    expect(result.reconciliationCursor, isNull);
  });

  test('keeps one-key HTTP request shape without a cursor field', () async {
    final client = _FakeClient(const MobileReviewHttpResponse(
      statusCode: 200,
      body: '{"outcomes":[]}',
    ));
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(session),
      client: client,
      endpoint: endpoint,
    );

    await transport.upload([event]);

    expect(client.body?.keys, ['items']);
  });

  for (final malformed in <String>[
    // Missing cursor on an acknowledged outcome.
    '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false}]}',
    // Empty cursor on an acknowledged outcome.
    '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":""}]}',
    // Negative cursor.
    '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":"-1"}]}',
    // Non-decimal cursor.
    '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":"1.5"}]}',
    // Non-string cursor (JS number).
    '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":42}]}',
  ]) {
    test('rejects malformed acknowledged cursor $malformed', () async {
      final transport = HttpReviewSyncTransport(
        sessionStore: _FakeStore(session),
        client: _FakeClient(MobileReviewHttpResponse(
          statusCode: 200,
          body: malformed,
        )),
        endpoint: endpoint,
      );

      await expectLater(
        transport.upload([event]),
        throwsA(isA<MobileReviewTransportException>()),
      );
    });
  }

  test('rejects a response with an extra top-level key', () async {
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(session),
      client: _FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"outcomes":[],"reconciliationCursor":"1"}',
      )),
      endpoint: endpoint,
    );

    await expectLater(
      transport.upload([event]),
      throwsA(isA<MobileReviewTransportException>()),
    );
  });
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
}
