import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';

void main() {
  test('MobileSession keeps opaque credentials and session identity together',
      () {
    const session = MobileSession(
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      sessionId: 'session-id',
    );
    expect(session.accessToken, 'access-token');
    expect(session.refreshToken, 'refresh-token');
    expect(session.sessionId, 'session-id');
  });

  test('MobileSessionStore exposes only async read/write/clear operations',
      () async {
    final store = _MemorySessionStore();
    const session = MobileSession(
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      sessionId: 'session-id',
    );
    expect(await store.read(), isNull);
    await store.write(session);
    expect(await store.read(), same(session));
    await store.clear();
    expect(await store.read(), isNull);
  });
}

class _MemorySessionStore implements MobileSessionStore {
  MobileSession? value;

  @override
  Future<MobileSession?> read() async => value;

  @override
  Future<void> write(MobileSession session) async {
    value = session;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}
