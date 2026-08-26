/// Provider-neutral HTTP boundary for the dormant native auth client.
///
/// No host, token, secret or endpoint path is hard-coded; endpoints are derived
/// only from the HTTPS origin supplied to the constructor. Responses are parsed
/// strictly and never logged.
library;

import 'dart:async';
import 'dart:convert';

/// Typed JSON response returned by an injected transport.
class MobileAuthHttpResponse {
  const MobileAuthHttpResponse({
    required this.statusCode,
    required this.contentType,
    required this.body,
  });

  final int statusCode;
  final String contentType;
  final String body;
}

/// Minimal injected JSON POST boundary, so callers stay provider-neutral.
abstract interface class MobileAuthHttpTransport {
  Future<MobileAuthHttpResponse> postJson({
    required String method,
    required Uri endpoint,
    required Map<String, Object> body,
    String? accessToken,
  });
}

/// Typed generic failure for the dormant native auth boundary.
class MobileAuthException implements Exception {
  const MobileAuthException(this.code);

  final String code;

  @override
  String toString() => 'MobileAuthException($code)';
}

/// Strict HTTPS-only JSON client for the native auth endpoints.
///
/// Endpoints are exact and relative to the supplied origin only; the origin is
/// the sole runtime endpoint input. Timeouts are bounded and responses are
/// validated strictly (status, content and exact JSON object shape).
class MobileAuthHttpClient {
  MobileAuthHttpClient({
    required Uri origin,
    required MobileAuthHttpTransport client,
    this.timeout = const Duration(seconds: 15),
  })  : _origin = origin,
        _client = client {
    if (!_isAllowedOrigin(origin)) {
      throw ArgumentError.value(
          origin, 'origin', 'must be a bare HTTPS origin');
    }
    if (timeout <= Duration.zero) {
      throw ArgumentError.value(timeout, 'timeout', 'must be positive');
    }
  }

  static const _requestPath = '/api/auth/mobile/otp/request';
  static const _verifyPath = '/api/auth/mobile/otp/verify';
  static const _refreshPath = '/api/auth/mobile/session/refresh';
  static const _revokePath = '/api/auth/mobile/session/revoke';

  static const _originPaths = <String>['', '/'];

  static bool _isAllowedOrigin(Uri origin) {
    // Exact bare HTTPS origin: no credentials, path, query or fragment.
    // Dart normalizes an explicit :443 into hasPort=false, so explicit
    // non-default ports are rejected by hasPort; :443 is indistinguishable
    // from a bare origin and is therefore accepted.
    return origin.scheme == 'https' &&
        origin.host.isNotEmpty &&
        origin.userInfo.isEmpty &&
        !origin.hasPort &&
        origin.hasQuery == false &&
        origin.hasFragment == false &&
        _originPaths.contains(origin.path);
  }

  final Uri _origin;
  final MobileAuthHttpTransport _client;
  final Duration timeout;

  /// Requests an OTP challenge for the given phone.
  Future<MobileOtpChallenge> requestOtp({required String phone}) async {
    final response =
        await _post(_requestPath, <String, Object>{'phone': phone});
    _requireJsonContentType(response);
    if (response.statusCode != 201) {
      throw const MobileAuthException('serverUnavailable');
    }
    final challengeId = _exactStringField(response, 'challengeId');
    final expiresAt = _exactDateTimeField(response, 'expiresAt');
    final resendAvailableAt =
        _exactDateTimeField(response, 'resendAvailableAt');
    return MobileOtpChallenge(
      challengeId: challengeId,
      expiresAt: expiresAt,
      resendAvailableAt: resendAvailableAt,
    );
  }

  /// Verifies an OTP and returns the native session tokens.
  Future<MobileTokenPair> verifyOtp({
    required String challengeId,
    required String code,
    required String installationId,
    required String phone,
  }) async {
    final response = await _post(
      _verifyPath,
      <String, Object>{
        'challengeId': challengeId,
        'code': code,
        'installationId': installationId,
        'phone': phone,
      },
    );
    _requireJsonContentType(response);
    if (response.statusCode != 200) {
      throw const MobileAuthException('serverUnavailable');
    }
    return _sessionFrom(response);
  }

  /// Rotates the native session and returns the new token pair.
  Future<MobileTokenPair> refreshSession({
    required String sessionId,
    required String refreshToken,
  }) async {
    final response = await _post(
      _refreshPath,
      <String, Object>{'sessionId': sessionId, 'refreshToken': refreshToken},
    );
    _requireJsonContentType(response);
    if (response.statusCode != 200) {
      throw const MobileAuthException('serverUnavailable');
    }
    return _sessionFrom(response);
  }

  /// Best-effort server-side revocation. A non-204 response is a typed failure.
  Future<void> revokeSession({required String accessToken}) async {
    final response = await _post(
      _revokePath,
      const <String, Object>{},
      accessToken: accessToken,
    );
    if (response.statusCode != 204 || response.body.isNotEmpty) {
      throw const MobileAuthException('serverUnavailable');
    }
  }

  static void _requireJsonContentType(MobileAuthHttpResponse response) {
    if (!RegExp(r'^application/json(?:;\s*charset=utf-8)?$',
            caseSensitive: false)
        .hasMatch(response.contentType)) {
      throw const MobileAuthException('validation');
    }
  }

  Future<MobileAuthHttpResponse> _post(
    String path,
    Map<String, Object> body, {
    String? accessToken,
  }) async {
    final endpoint = _origin.replace(path: path);
    try {
      return await _client
          .postJson(
            method: 'POST',
            endpoint: endpoint,
            body: body,
            accessToken: accessToken,
          )
          .timeout(timeout);
    } on TimeoutException {
      throw const MobileAuthException('timeout');
    } on MobileAuthException {
      rethrow;
    } catch (_) {
      throw const MobileAuthException('serverUnavailable');
    }
  }

  MobileTokenPair _sessionFrom(MobileAuthHttpResponse response) {
    final accessToken = _exactStringField(response, 'accessToken');
    final refreshToken = _exactStringField(response, 'refreshToken');
    return MobileTokenPair(
        accessToken: accessToken, refreshToken: refreshToken);
  }

  static String _exactStringField(
    MobileAuthHttpResponse response,
    String key,
  ) {
    final decoded = _exactObject(response);
    final value = decoded[key];
    if (value is! String || value.isEmpty) {
      throw const MobileAuthException('validation');
    }
    return value;
  }

  static DateTime _exactDateTimeField(
    MobileAuthHttpResponse response,
    String key,
  ) {
    final value = _exactStringField(response, key);
    final parsed = DateTime.tryParse(value);
    if (parsed == null || !parsed.isUtc) {
      throw const MobileAuthException('validation');
    }
    return parsed;
  }

  static Map<String, Object> _exactObject(MobileAuthHttpResponse response) {
    final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const MobileAuthException('validation');
    }
    if (decoded is! Map<String, Object?>) {
      throw const MobileAuthException('validation');
    }
    return decoded.cast<String, Object>();
  }
}

/// Typed result of a successful OTP request.
class MobileOtpChallenge {
  const MobileOtpChallenge({
    required this.challengeId,
    required this.expiresAt,
    required this.resendAvailableAt,
  });

  final String challengeId;
  final DateTime expiresAt;
  final DateTime resendAvailableAt;
}

/// Typed native session tokens returned by verify and refresh.
class MobileTokenPair {
  const MobileTokenPair(
      {required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}
