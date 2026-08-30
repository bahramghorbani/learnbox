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

  test(
      'uploads ordered events with bearer access token and returns acknowledgements',
      () async {
    final client = _FakeClient(const MobileReviewHttpResponse(
      statusCode: 200,
      body:
          '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"event-1","idempotent":false,"reconciliationCursor":"1"}]}',
    ));
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(const MobileSession(
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionId: 'session-id',
      )),
      client: client,
      endpoint: Uri.parse('https://learnbox.example/api/reviews/mobile'),
    );

    final result = await transport.upload([event]);

    expect(result.acknowledgedClientEventIds, ['event-1']);
    expect(client.accessToken, 'access-token');
    expect(client.body?['items'], isA<List<Object>>());
  });

  test('rejects batches larger than the strict native maximum', () {
    final client = _FakeClient(const MobileReviewHttpResponse(
      statusCode: 200,
      body: '{"outcomes":[]}',
    ));
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(const MobileSession(
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionId: 'session-id',
      )),
      client: client,
      endpoint: Uri.parse('https://learnbox.example/api/reviews/mobile'),
    );

    expect(
      () => transport.upload(List<PendingReviewEvent>.filled(21, event)),
      throwsA(isA<MobileReviewTransportException>()),
    );
  });

  test('rejects non-loopback HTTP endpoints', () {
    expect(
      () => HttpReviewSyncTransport(
        sessionStore: _FakeStore(null),
        client: _FakeClient(const MobileReviewHttpResponse(
          statusCode: 200,
          body: '{"outcomes":[]}',
        )),
        endpoint: Uri.parse('http://learnbox.example/api/reviews/mobile'),
      ),
      throwsArgumentError,
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
  String? accessToken;
  Map<String, Object>? body;

  @override
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  }) async {
    this.accessToken = accessToken;
    this.body = body;
    return response;
  }
}
