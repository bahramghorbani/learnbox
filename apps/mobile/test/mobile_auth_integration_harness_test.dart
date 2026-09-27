import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_auth_client.dart';
import 'package:learnbox/features/identity/mobile_auth_http_client.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';

void main() {
  test('local harness completes request, verify, refresh and revoke', () async {
    final transport = _LocalAuthTransport();
    final store = _MemorySessionStore();
    final client = MobileAuthClient(
      origin: Uri.parse('https://local-auth.test'),
      http: transport,
      store: store,
    );

    final challenge = await client.requestOtp(phone: '+989000000000');
    expect(challenge.challengeId, 'challenge-local');
    expect(store.value, isNull);

    final verified = await client.verifyOtp(
      challengeId: challenge.challengeId,
      code: '12345',
      installationId: 'installation-local',
      phone: '+989000000000',
    );
    expect(verified.sessionId, 'session-local');
    expect(store.value?.refreshToken, 'refresh-local');

    final refreshed = await client.refreshSession();
    expect(refreshed.accessToken, _syntheticToken('rotated'));
    expect(store.value?.accessToken, refreshed.accessToken);

    await client.revokeSession();
    expect(store.value, isNull);
    expect(transport.paths, [
      '/api/auth/mobile/otp/request',
      '/api/auth/mobile/otp/verify',
      '/api/auth/mobile/session/refresh',
      '/api/auth/mobile/session/revoke',
    ]);
    expect(transport.revokeAccessToken, refreshed.accessToken);
  });

  test('local harness never persists a rejected verification', () async {
    final transport = _LocalAuthTransport(rejectVerification: true);
    final store = _MemorySessionStore();
    final client = MobileAuthClient(
      origin: Uri.parse('https://local-auth.test'),
      http: transport,
      store: store,
    );

    final challenge = await client.requestOtp(phone: '+989000000000');
    await expectLater(
      client.verifyOtp(
        challengeId: challenge.challengeId,
        code: '00000',
        installationId: 'installation-local',
        phone: '+989000000000',
      ),
      throwsA(isA<MobileAuthException>()),
    );
    expect(store.value, isNull);
  });
}

class _LocalAuthTransport implements MobileAuthHttpTransport {
  _LocalAuthTransport({this.rejectVerification = false});

  final bool rejectVerification;
  final List<String> paths = [];
  String? revokeAccessToken;

  @override
  Future<MobileAuthHttpResponse> postJson({
    required String method,
    required Uri endpoint,
    required Map<String, Object> body,
    String? accessToken,
  }) async {
    paths.add(endpoint.path);
    switch (endpoint.path) {
      case '/api/auth/mobile/otp/request':
        return const MobileAuthHttpResponse(
          statusCode: 201,
          contentType: 'application/json',
          body:
              '{"challengeId":"challenge-local","expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
        );
      case '/api/auth/mobile/otp/verify':
        if (rejectVerification) {
          return const MobileAuthHttpResponse(
            statusCode: 400,
            contentType: 'application/json',
            body: '{"error":"invalidCode"}',
          );
        }
        return MobileAuthHttpResponse(
          statusCode: 200,
          contentType: 'application/json',
          body: jsonEncode({
            'accessToken': _syntheticToken('base'),
            'refreshToken': 'refresh-local',
          }),
        );
      case '/api/auth/mobile/session/refresh':
        return MobileAuthHttpResponse(
          statusCode: 200,
          contentType: 'application/json',
          body: jsonEncode({
            'accessToken': _syntheticToken('rotated'),
            'refreshToken': 'refresh-local-rotated',
          }),
        );
      case '/api/auth/mobile/session/revoke':
        revokeAccessToken = accessToken;
        return const MobileAuthHttpResponse(
          statusCode: 204,
          contentType: '',
          body: '',
        );
      default:
        throw StateError('unexpected local harness path: ${endpoint.path}');
    }
  }
}

String _syntheticToken(String suffix) {
  final payload = base64Url.encode(
    utf8.encode(jsonEncode({'sid': 'session-local'})),
  );
  return 'header.$payload.signature-$suffix';
}

class _MemorySessionStore implements MobileSessionStore {
  MobileSession? value;

  @override
  Future<MobileSession?> read() async => value;

  @override
  Future<void> write(MobileSession session) async => value = session;

  @override
  Future<void> clear() async => value = null;
}
