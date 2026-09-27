import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_auth_http_client.dart';

void main() {
  final origin = Uri.parse('https://preview.learnbox.example');

  test('rejects non-HTTPS, credentialed, path-bearing or query-bearing origins',
      () {
    for (final value in <String>[
      'http://preview.learnbox.example',
      'https://user:pass@preview.learnbox.example',
      'https://preview.learnbox.example/auth',
      'https://preview.learnbox.example:8443',
      'https://preview.learnbox.example/?q=1',
      'https://preview.learnbox.example/#frag',
    ]) {
      expect(
        () => MobileAuthHttpClient(
          origin: Uri.parse(value),
          client: _FakeTransport(),
        ),
        throwsArgumentError,
        reason: value,
      );
    }
  });

  test('rejects non-positive timeout', () {
    expect(
      () => MobileAuthHttpClient(
        origin: origin,
        client: _FakeTransport(),
        timeout: Duration.zero,
      ),
      throwsArgumentError,
    );
  });

  test('request posts exact JSON body and returns typed challenge', () async {
    final transport = _FakeTransport();
    final client = MobileAuthHttpClient(origin: origin, client: transport);

    final challenge = await client.requestOtp(phone: '+989121234567');

    expect(transport.calls, hasLength(1));
    final call = transport.calls.single;
    expect(call.method, 'POST');
    expect(call.uri.toString(),
        'https://preview.learnbox.example/api/auth/mobile/otp/request');
    expect(call.body, {'phone': '+989121234567'});
    expect(call.accessToken, isNull);
    expect(challenge.challengeId, 'challenge-1');
    expect(challenge.expiresAt, DateTime.utc(2026, 8, 26, 10));
    expect(challenge.resendAvailableAt, DateTime.utc(2026, 8, 26, 10, 2));
  });

  test('verify posts exact JSON body with bearer access token', () async {
    final transport = _FakeTransport(
        response: MobileAuthHttpResponse(
      statusCode: 200,
      contentType: 'application/json; charset=utf-8',
      body: '{"accessToken":"access-token","refreshToken":"refresh-token"}',
    ));
    final client = MobileAuthHttpClient(origin: origin, client: transport);

    await client.verifyOtp(
      challengeId: 'challenge-1',
      code: '12345',
      installationId: 'installation-1',
      phone: '+989121234567',
    );

    final call = transport.calls.single;
    expect(call.uri.toString(),
        'https://preview.learnbox.example/api/auth/mobile/otp/verify');
    expect(call.body, {
      'challengeId': 'challenge-1',
      'code': '12345',
      'installationId': 'installation-1',
      'phone': '+989121234567',
    });
    expect(call.accessToken, isNull);
  });

  test('verify returns typed session on 200', () async {
    final transport = _FakeTransport(
        response: MobileAuthHttpResponse(
      statusCode: 200,
      contentType: 'application/json; charset=utf-8',
      body: '{"accessToken":"access-token","refreshToken":"refresh-token"}',
    ));
    final client = MobileAuthHttpClient(origin: origin, client: transport);

    final session = await client.verifyOtp(
      challengeId: 'challenge-1',
      code: '12345',
      installationId: 'installation-1',
      phone: '+989121234567',
    );

    expect(session.accessToken, 'access-token');
    expect(session.refreshToken, 'refresh-token');
  });

  test('refresh posts exact JSON body and returns rotated session', () async {
    final transport = _FakeTransport(
        response: MobileAuthHttpResponse(
      statusCode: 200,
      contentType: 'application/json; charset=utf-8',
      body: '{"accessToken":"access-token-2","refreshToken":"refresh-token-2"}',
    ));
    final client = MobileAuthHttpClient(origin: origin, client: transport);

    final session = await client.refreshSession(
      sessionId: 'session-1',
      refreshToken: 'refresh-token-1',
    );

    final call = transport.calls.single;
    expect(call.uri.toString(),
        'https://preview.learnbox.example/api/auth/mobile/session/refresh');
    expect(call.body,
        {'sessionId': 'session-1', 'refreshToken': 'refresh-token-1'});
    expect(call.accessToken, isNull);
    expect(session.accessToken, 'access-token-2');
    expect(session.refreshToken, 'refresh-token-2');
  });

  test('revoke posts empty JSON body with bearer access token', () async {
    final transport = _FakeTransport(
        response: MobileAuthHttpResponse(
      statusCode: 204,
      contentType: 'application/json; charset=utf-8',
      body: '',
    ));
    final client = MobileAuthHttpClient(origin: origin, client: transport);

    await client.revokeSession(accessToken: 'access-token');

    final call = transport.calls.single;
    expect(call.uri.toString(),
        'https://preview.learnbox.example/api/auth/mobile/session/revoke');
    expect(call.body, isEmpty);
    expect(call.accessToken, 'access-token');
  });

  test('applies bounded timeout and surfaces typed timeout failure', () async {
    final transport = _FakeTransport(
      response: MobileAuthHttpResponse(
          statusCode: 200,
          contentType: 'application/json; charset=utf-8',
          body: '{}'),
      delay: const Duration(milliseconds: 60),
    );
    final client = MobileAuthHttpClient(
      origin: origin,
      client: transport,
      timeout: const Duration(milliseconds: 10),
    );

    await expectLater(
      client.requestOtp(phone: '+989121234567'),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'timeout')),
    );
  });

  test('non-2xx maps to typed generic failure', () async {
    final transport = _FakeTransport(
        response: MobileAuthHttpResponse(
      statusCode: 429,
      contentType: 'application/json; charset=utf-8',
      body: '{"error":"rateLimited"}',
    ));
    final client = MobileAuthHttpClient(origin: origin, client: transport);

    await expectLater(
      client.requestOtp(phone: '+989121234567'),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'serverUnavailable')),
    );
  });

  test('platform access responses use a distinct Preview access failure',
      () async {
    final client = MobileAuthHttpClient(
      origin: origin,
      client: _FakeTransport(
        response: const MobileAuthHttpResponse(
          statusCode: 401,
          contentType: 'text/plain',
          body: 'protected by platform',
        ),
      ),
    );

    await expectLater(
      client.requestOtp(phone: '+989****4567'),
      throwsA(isA<MobileAuthException>().having(
        (error) => error.code,
        'code',
        'previewAccessRequired',
      )),
    );
  });

  test('wrong response content type is a typed validation failure', () async {
    final client = MobileAuthHttpClient(
      origin: origin,
      client: _FakeTransport(
        response: MobileAuthHttpResponse(
          statusCode: 201,
          contentType: 'text/plain',
          body:
              '{"challengeId":"challenge-1","expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
        ),
      ),
    );

    await expectLater(
      client.requestOtp(phone: '+989121234567'),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'validation')),
    );
  });
  test('non-JSON content type is a typed validation failure', () async {
    final client = MobileAuthHttpClient(
      origin: origin,
      client: _FakeTransport(
          response: MobileAuthHttpResponse(
        statusCode: 201,
        contentType: 'text/plain',
        body: '{"challengeId":"challenge-1"}',
      )),
    );

    await expectLater(
      client.requestOtp(phone: '+989121234567'),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'validation')),
    );
  });

  test('unexpected response keys are a typed validation failure', () async {
    final client = MobileAuthHttpClient(
      origin: origin,
      client: _FakeTransport(
          response: MobileAuthHttpResponse(
        statusCode: 201,
        contentType: 'application/json; charset=utf-8',
        body:
            '{"challengeId":"challenge-1","expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z","extra":"reject"}',
      )),
    );

    await expectLater(
      client.requestOtp(phone: '+989121234567'),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'validation')),
    );
  });

  test('null or non-string JSON values are a typed validation failure',
      () async {
    for (final body in <String>[
      '{"challengeId":null,"expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
      '{"challengeId":42,"expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
      '{"challengeId":"challenge-1","expiresAt":null,"resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
    ]) {
      final client = MobileAuthHttpClient(
        origin: origin,
        client: _FakeTransport(
            response: MobileAuthHttpResponse(
          statusCode: 201,
          contentType: 'application/json; charset=utf-8',
          body: body,
        )),
      );

      await expectLater(
        client.requestOtp(phone: '+989121234567'),
        throwsA(isA<MobileAuthException>()
            .having((error) => error.code, 'code', 'validation')),
        reason: body,
      );
    }
  });

  test('malformed or unexpected JSON is a typed validation failure', () async {
    final client = MobileAuthHttpClient(
      origin: origin,
      client: _FakeTransport(
        response: MobileAuthHttpResponse(
          statusCode: 201,
          contentType: 'application/json; charset=utf-8',
          body: '{"unexpected":"value"}',
        ),
      ),
    );

    await expectLater(
      client.requestOtp(phone: '+989121234567'),
      throwsA(isA<MobileAuthException>()
          .having((error) => error.code, 'code', 'validation')),
    );
  });
}

class _FakeTransport implements MobileAuthHttpTransport {
  _FakeTransport({
    this.response = const MobileAuthHttpResponse(
      statusCode: 201,
      contentType: 'application/json; charset=utf-8',
      body:
          '{"challengeId":"challenge-1","expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
    ),
    this.delay = Duration.zero,
  });

  final MobileAuthHttpResponse response;
  Duration delay = Duration.zero;
  final List<_RecordedCall> calls = [];

  @override
  Future<MobileAuthHttpResponse> postJson({
    required String method,
    required Uri endpoint,
    required Map<String, Object> body,
    String? accessToken,
  }) async {
    calls.add(_RecordedCall(
      method: method,
      uri: endpoint,
      body: body,
      accessToken: accessToken,
    ));
    if (delay > Duration.zero) {
      await Future<void>.delayed(delay);
    }
    return MobileAuthHttpResponse(
      statusCode: response.statusCode,
      contentType: response.contentType,
      body: response.body,
    );
  }
}

class _RecordedCall {
  const _RecordedCall({
    required this.method,
    required this.uri,
    required this.body,
    required this.accessToken,
  });

  final String method;
  final Uri uri;
  final Map<String, Object> body;
  final String? accessToken;
}
