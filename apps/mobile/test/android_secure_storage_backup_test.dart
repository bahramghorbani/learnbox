import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android manifest disables backup of secure storage ciphertext',
      () async {
    final manifest =
        await File('android/app/src/main/AndroidManifest.xml').readAsString();
    final applicationTag = RegExp(
      r'<application\b[^>]*>',
      multiLine: true,
    ).firstMatch(manifest)?.group(0);

    expect(applicationTag, isNotNull);
    expect(applicationTag, contains('android:allowBackup="false"'));
  });
}
