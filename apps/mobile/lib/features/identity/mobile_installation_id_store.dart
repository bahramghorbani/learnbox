import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class MobileInstallationSecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class FlutterMobileInstallationSecretStore
    implements MobileInstallationSecretStore {
  FlutterMobileInstallationSecretStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
}

class MobileInstallationIdStore {
  MobileInstallationIdStore({required MobileInstallationSecretStore secrets})
      : _secrets = secrets;

  static const key = 'learnbox.mobile.installation_id.v1';
  final MobileInstallationSecretStore _secrets;

  Future<String> readOrCreate() async {
    final existing = await _secrets.read(key);
    if (existing != null && _isValid(existing)) return existing;

    final generated = _generate();
    await _secrets.write(key, generated);
    return generated;
  }

  static String _generate() {
    final bytes = List<int>.generate(16, (_) => Random.secure().nextInt(256));
    return base64UrlEncode(bytes).replaceAll('=', '');
  }

  static bool _isValid(String value) =>
      RegExp(r'^[A-Za-z0-9_-]{22}$').hasMatch(value);
}
