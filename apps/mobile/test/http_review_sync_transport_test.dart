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
          '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1"}]}',
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

  test('fails closed when no session or response is not a valid success',
      () async {
    final client = _FakeClient(
        const MobileReviewHttpResponse(statusCode: 503, body: '{}'));
    final transport = HttpReviewSyncTransport(
      sessionStore: _FakeStore(null),
      client: client,
      endpoint: Uri.parse('https://learnbox.example/api/reviews/mobile'),
    );
    expect(
      () => transport.upload([event]),
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
