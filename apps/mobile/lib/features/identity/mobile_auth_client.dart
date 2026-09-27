/// Typed dormant native auth client over the injected HTTP boundary.
///
/// Persists the session only through the injected [MobileSessionStore] after a
/// successful verify or refresh; clears locally before best-effort remote
/// revoke. No logging, secrets or runtime endpoint input beyond the origin.
library;

import 'dart:convert';

import 'mobile_auth_http_client.dart'
    show
        MobileAuthException,
        MobileAuthHttpClient,
        MobileAuthHttpTransport,
        MobileOtpChallenge;
import 'mobile_session.dart';
import 'mobile_session_store.dart';

/// Typed dormant native auth client for request/verify/refresh/revoke.
class MobileAuthClient {
  MobileAuthClient({
    required Uri origin,
    required MobileAuthHttpTransport http,
    required MobileSessionStore store,
  })  : _origin = origin,
        _http = http,
        _store = store {
    if (origin.scheme != 'https' || origin.host.isEmpty) {
      throw ArgumentError.value(origin, 'origin', 'must be an HTTPS origin');
    }
  }

  final Uri _origin;
  final MobileAuthHttpTransport _http;
  final MobileSessionStore _store;

  /// Requests an OTP challenge. Never touches the session store.
  Future<MobileOtpChallenge> requestOtp({required String phone}) {
    return MobileAuthHttpClient(origin: _origin, client: _http)
        .requestOtp(phone: phone);
  }

  /// Verifies an OTP and persists the returned session on success.
  Future<MobileSession> verifyOtp({
    required String challengeId,
    required String code,
    required String installationId,
    required String phone,
  }) async {
    final pair =
        await MobileAuthHttpClient(origin: _origin, client: _http).verifyOtp(
      challengeId: challengeId,
      code: code,
      installationId: installationId,
      phone: phone,
    );
    final session = MobileSession(
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      sessionId: _sessionIdFromAccessToken(pair.accessToken),
    );
    await _store.write(session);
    return session;
  }

  /// Rotates the persisted session and persists the new tokens on success.
  Future<MobileSession> refreshSession() async {
    final current = await _store.read();
    if (current == null) {
      throw const MobileAuthException('authenticationRequired');
    }
    final pair = await MobileAuthHttpClient(origin: _origin, client: _http)
        .refreshSession(
      sessionId: current.sessionId,
      refreshToken: current.refreshToken,
    );
    final session = MobileSession(
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      sessionId: current.sessionId,
    );
    await _store.write(session);
    return session;
  }

  /// Clears the local session first, then best-effort revokes remotely.
  Future<void> revokeSession() async {
    final current = await _store.read();
    await _store.clear();
    if (current == null) {
      return;
    }
    try {
      await MobileAuthHttpClient(origin: _origin, client: _http)
          .revokeSession(accessToken: current.accessToken);
    } on MobileAuthException {
      // Local session is already cleared; remote revoke is best effort.
    }
  }

  /// The opaque server session id is the access token's `sid` claim; the
  /// token is opaque to the client, so the session id is opaque too.
  static String _sessionIdFromAccessToken(String accessToken) {
    final sessionId = _decodeSid(accessToken);
    if (sessionId == null || sessionId.isEmpty) {
      throw const MobileAuthException('validation');
    }
    return sessionId;
  }

  static String? _decodeSid(String accessToken) {
    final segments = accessToken.split('.');
    if (segments.length != 3) {
      return null;
    }
    final payload = segments[1];
    if (payload.isEmpty) {
      return null;
    }
    final String json;
    try {
      json = String.fromCharCodes(base64Url.decode(payload));
    } catch (_) {
      return null;
    }
    try {
      final claims = jsonDecode(json);
      if (claims is Map<String, Object?> && claims['sid'] is String) {
        return claims['sid'] as String;
      }
      return null;
    } catch (_) {
      return null;
    }
  }
}
