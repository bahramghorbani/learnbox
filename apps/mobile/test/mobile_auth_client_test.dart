import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_auth_client.dart';
import 'package:learnbox/features/identity/mobile_auth_http_client.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';

void main() {
  final origin = Uri.parse('https://preview.learnbox.example');
  const persisted = MobileSession(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    sessionId: 'session-1',
  );

  test('rejects non-HTTPS origin at construction', () {
    expect(
      () => MobileAuthClient(
        origin: Uri.parse('http://preview.learnbox.example'),
        http: _FakeHttpTransport(),
        store: _FakeSessionStore(),
      ),
      throwsArgumentError,
    );
  });

  test('requestOtp forwards challenge without touching the store', () async {
    final store = _FakeSessionStore();
    final http = _FakeHttpTransport(MobileAuthHttpResponse(
      statusCode: 201,
      contentType: 'application/json; charset=utf-8',
      body:
          '{"challengeId":"challenge-1","expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
    ));
    final client = MobileAuthClient(
      origin: origin,
      http: http,
      store: store,
    );

    final challenge = await client.requestOtp(phone: '+989121234567');

    expect(challenge.challengeId, 'challenge-1');
    expect(store.writeCount, 0);
    expect(store.clearCount, 0);
  });

  test('verifyOtp persists returned tokens and session id on success',
      () async {
    final store = _FakeSessionStore();
    final http = _FakeHttpTransport(MobileAuthHttpResponse(
      statusCode: 200,
      contentType: 'application/json; charset=utf-8',
      body:
          '{"accessToken":"eyJ2IjoxLCJhdWQiOiJsZWFybmJveC1tb2JpbGUifQ.eyJzdWIiOiJsZWFybmVyLTEiLCJzaWQiOiJzZXNzaW9uLTEiLCJpYXQiOjE3NTYwMDAwMDAsImV4cCI6MTc1NjAwMDkwMCwianRpIjoiQUFBQUFBQUFBQUFBQUFBQUFBQUFBQSJ9.signature","refreshToken":"refresh-token"}',
    ));
    final client = MobileAuthClient(
      origin: origin,
      http: http,
      store: store,
    );

    final session = await client.verifyOtp(
      challengeId: 'challenge-1',
      code: '12345',
      installationId: 'installation-1',
      phone: '+989121234567',
    );

    expect(session.accessToken, store.written?.accessToken);
    expect(session.refreshToken, 'refresh-token');
    expect(store.written?.refreshToken, 'refresh-token');
    expect(store.written?.sessionId, 'session-1');
  });

  test('verifyOtp failure writes nothing', () async {
    final store = _FakeSessionStore();
    final http = _FakeHttpTransport(MobileAuthHttpResponse(
      statusCode: 400,
      contentType: 'application/json; charset=utf-8',
      body: '{"error":"invalidChallenge"}',
    ));
    final client = MobileAuthClient(
      origin: origin,
      http: http,
      store: store,
    );

    await expectLater(
      client.verifyOtp(
        challengeId: 'challenge-1',
        code: '12345',
        installationId: 'installation-1',
        phone: '+989121234567',
      ),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'serverUnavailable')),
    );
    expect(store.written, isNull);
  });

  test('refreshSession persists rotated tokens on success', () async {
    final store = _FakeSessionStore(persisted);
    final http = _FakeHttpTransport(MobileAuthHttpResponse(
      statusCode: 200,
      contentType: 'application/json; charset=utf-8',
      body: '{"accessToken":"access-token-2","refreshToken":"refresh-token-2"}',
    ));
    final client = MobileAuthClient(
      origin: origin,
      http: http,
      store: store,
    );

    final session = await client.refreshSession();

    expect(session.accessToken, 'access-token-2');
    expect(session.refreshToken, 'refresh-token-2');
    expect(store.written?.accessToken, 'access-token-2');
    expect(store.written?.refreshToken, 'refresh-token-2');
    expect(store.written?.sessionId, 'session-1');
  });

  test('refreshSession without a persisted session is a typed failure',
      () async {
    final store = _FakeSessionStore(null);
    final client = MobileAuthClient(
      origin: origin,
      http: _FakeHttpTransport(),
      store: store,
    );

    await expectLater(
      client.refreshSession(),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'authenticationRequired')),
    );
  });

  test('revokeSession clears the local store before best-effort remote revoke',
      () async {
    final store = _FakeSessionStore(persisted);
    final http = _FakeHttpTransport(MobileAuthHttpResponse(
      statusCode: 204,
      contentType: 'application/json; charset=utf-8',
      body: '',
    ));
    final client = MobileAuthClient(
      origin: origin,
      http: http,
      store: store,
    );

    await client.revokeSession();

    expect(store.clearCount, 1);
    expect(http.lastAccessToken, 'access-token');
  });

  test('revokeSession clears locally even when the remote revoke fails',
      () async {
    final store = _FakeSessionStore(persisted);
    final http = _FakeHttpTransport(MobileAuthHttpResponse(
      statusCode: 401,
      contentType: 'application/json; charset=utf-8',
      body: '{"error":"invalidToken"}',
    ));
    final client = MobileAuthClient(
      origin: origin,
      http: http,
      store: store,
    );

    await client.revokeSession();

    expect(store.clearCount, 1);
    expect(http.lastAccessToken, 'access-token');
  });
}

class _FakeHttpTransport implements MobileAuthHttpTransport {
  _FakeHttpTransport(
      [this.response = const MobileAuthHttpResponse(
        statusCode: 200,
        contentType: 'application/json; charset=utf-8',
        body:
            '{"accessToken":"eyJ2IjoxLCJhdWQiOiJsZWFybmJveC1tb2JpbGUifQ.eyJzdWIiOiJsZWFybmVyLTEiLCJzaWQiOiJzZXNzaW9uLTEiLCJpYXQiOjE3NTYwMDAwMDAsImV4cCI6MTc1NjAwMDkwMCwianRpIjoiQUFBQUFBQUFBQUFBQUFBQUFBQUFBQSJ9.signature","refreshToken":"refresh-token"}',
      )]);

  final MobileAuthHttpResponse response;
  String? lastAccessToken;
  Map<String, Object>? lastBody;

  @override
  Future<MobileAuthHttpResponse> postJson({
    required String method,
    required Uri endpoint,
    required Map<String, Object> body,
    String? accessToken,
  }) async {
    lastAccessToken = accessToken;
    lastBody = body;
    return response;
  }
}

class _FakeSessionStore implements MobileSessionStore {
  _FakeSessionStore([this.value]);

  MobileSession? value;
  MobileSession? written;
  int writeCount = 0;
  int clearCount = 0;

  @override
  Future<MobileSession?> read() async => value;

  @override
  Future<void> write(MobileSession session) async {
    written = session;
    writeCount++;
  }

  @override
  Future<void> clear() async {
    clearCount++;
  }
}
