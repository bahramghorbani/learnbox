import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_auth_http_client.dart';
import 'package:learnbox/features/identity/mobile_auth_http_transport.dart';
import 'package:learnbox/features/identity/mobile_installation_id_store.dart';
import 'package:learnbox/features/identity/mobile_preview_auth_runtime.dart';

class _MemorySecretStore implements MobileInstallationSecretStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

void main() {
  test(
      'installation ID is generated once and stored in the injected secure store',
      () async {
    final secrets = _MemorySecretStore();
    final store = MobileInstallationIdStore(secrets: secrets);

    final first = await store.readOrCreate();
    final second = await store.readOrCreate();

    expect(first, second);
    expect(first, matches(RegExp(r'^[A-Za-z0-9_-]{22}$')));
    expect(secrets.values, hasLength(1));
  });

  test('runtime stays disabled when compile-time values are not valid', () {
    final runtime = MobilePreviewAuthRuntime.fromValues(
      origin: '',
      verifyEnabled: '',
      approvedOrigin: 'https://preview.learnbox.example',
    );

    expect(runtime, isNull);
  });

  test('runtime accepts only an exact approved HTTPS origin', () {
    final runtime = MobilePreviewAuthRuntime.fromValues(
      origin: 'https://preview.learnbox.example',
      verifyEnabled: 'true',
      approvedOrigin: 'https://preview.learnbox.example',
    );

    expect(runtime, isNotNull);
    expect(runtime!.origin.toString(), 'https://preview.learnbox.example');
  });

  test('transport rejects non-HTTPS endpoints before opening a socket',
      () async {
    final transport = DartIoMobileAuthHttpTransport();

    await expectLater(
      transport.postJson(
        method: 'POST',
        endpoint:
            Uri.parse('http://127.0.0.1:3000/api/auth/mobile/otp/request'),
        body: const {'phone': '09121234567'},
      ),
      throwsA(isA<MobileAuthException>()),
    );
  });
}
