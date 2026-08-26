import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android host declares INTERNET without enabling cleartext traffic', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    expect(
      manifest,
      contains(
        '<uses-permission android:name="android.permission.INTERNET" />',
      ),
    );
    expect(manifest, isNot(contains('usesCleartextTraffic="true"')));
    expect(manifest, isNot(contains('networkSecurityConfig')));
  });
}
