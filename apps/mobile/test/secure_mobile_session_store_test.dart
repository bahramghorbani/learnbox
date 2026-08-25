import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/secure_mobile_session_store.dart';

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('writes and reads all session fields from secure storage', () async {
    const storage = FlutterSecureStorage();
    final store = SecureMobileSessionStore(storage: storage);
    const session = MobileSession(
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      sessionId: 'session-id',
    );

    await store.write(session);

    expect(await store.read(), isNotNull);
    final restored = await store.read();
    expect(restored?.accessToken, session.accessToken);
    expect(restored?.refreshToken, session.refreshToken);
    expect(restored?.sessionId, session.sessionId);
  });

  test(
      'returns null for incomplete storage and clear removes only session fields',
      () async {
    FlutterSecureStorage.setMockInitialValues({
      'unrelated.key': 'keep-me',
      'learnbox.mobile.access_token.v1': 'access-token',
    });
    const storage = FlutterSecureStorage();
    final store = SecureMobileSessionStore(storage: storage);

    expect(await store.read(), isNull);
    await store.clear();
    expect(await storage.read(key: 'unrelated.key'), 'keep-me');
    expect(await storage.read(key: 'learnbox.mobile.access_token.v1'), isNull);
  });
}
