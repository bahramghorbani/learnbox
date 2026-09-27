import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'mobile_session.dart';
import 'mobile_session_store.dart';

/// Secure-storage implementation for the dormant native session port.
class SecureMobileSessionStore implements MobileSessionStore {
  SecureMobileSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _accessTokenKey = 'learnbox.mobile.access_token.v1';
  static const _refreshTokenKey = 'learnbox.mobile.refresh_token.v1';
  static const _sessionIdKey = 'learnbox.mobile.session_id.v1';

  final FlutterSecureStorage _storage;

  @override
  Future<MobileSession?> read() async {
    final values = await Future.wait([
      _storage.read(key: _accessTokenKey),
      _storage.read(key: _refreshTokenKey),
      _storage.read(key: _sessionIdKey),
    ]);
    final accessToken = values[0];
    final refreshToken = values[1];
    final sessionId = values[2];
    if (accessToken == null || refreshToken == null || sessionId == null) {
      return null;
    }
    if (accessToken.isEmpty || refreshToken.isEmpty || sessionId.isEmpty) {
      return null;
    }
    return MobileSession(
      accessToken: accessToken,
      refreshToken: refreshToken,
      sessionId: sessionId,
    );
  }

  @override
  Future<void> write(MobileSession session) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: session.accessToken),
      _storage.write(key: _refreshTokenKey, value: session.refreshToken),
      _storage.write(key: _sessionIdKey, value: session.sessionId),
    ]);
  }

  @override
  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _sessionIdKey),
    ]);
  }
}
