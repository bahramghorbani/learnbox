import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_preview_auth_config.dart';

void main() {
  const approved = 'https://preview.learnbox.example';

  test('compile-time config is disabled when either define is absent', () {
    final config = MobilePreviewAuthConfig.fromValues(
      origin: '',
      verifyEnabled: '',
      approvedOrigin: approved,
    );

    expect(config.enabled, isFalse);
    expect(config.origin, isNull);
  });

  test('accepts only the exact approved HTTPS preview origin', () {
    final config = MobilePreviewAuthConfig.fromValues(
      origin: ' https://preview.learnbox.example ',
      verifyEnabled: 'true',
      approvedOrigin: approved,
    );

    expect(config.enabled, isTrue);
    expect(config.origin.toString(), approved);
  });

  test('rejects unsafe or non-approved origins', () {
    for (final origin in <String>[
      'http://preview.learnbox.example',
      'https://user:pass@preview.learnbox.example',
      'https://preview.learnbox.example/auth',
      'https://preview.learnbox.example:443',
      'https://production.learnbox.example',
    ]) {
      final config = MobilePreviewAuthConfig.fromValues(
        origin: origin,
        verifyEnabled: 'true',
        approvedOrigin: approved,
      );
      expect(config.enabled, isFalse, reason: origin);
      expect(config.origin, isNull, reason: origin);
    }
  });

  test('verification define must be exactly true', () {
    final config = MobilePreviewAuthConfig.fromValues(
      origin: approved,
      verifyEnabled: 'TRUE',
      approvedOrigin: approved,
    );

    expect(config.enabled, isFalse);
    expect(config.origin, isNull);
  });
}
