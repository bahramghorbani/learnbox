import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android manifest disables backup and links Android 12 extraction rules',
      () async {
    final manifest =
        await File('android/app/src/main/AndroidManifest.xml').readAsString();
    final applicationTag = RegExp(
      r'<application\b[^>]*>',
      multiLine: true,
    ).firstMatch(manifest)?.group(0);

    expect(applicationTag, isNotNull);
    expect(applicationTag, contains('android:allowBackup="false"'));
    expect(
      applicationTag,
      contains('android:dataExtractionRules="@xml/data_extraction_rules"'),
    );
  });

  test('Android 12 extraction rules exclude every secure-storage artifact',
      () async {
    final rulesFile =
        File('android/app/src/main/res/xml/data_extraction_rules.xml');
    expect(rulesFile.existsSync(), isTrue);
    final rules = await rulesFile.readAsString();
    final cloudBackup = _elementBody(rules, 'cloud-backup');
    final deviceTransfer = _elementBody(rules, 'device-transfer');

    for (final path in _secureStoragePreferenceFiles) {
      final exclusion = 'domain="sharedpref" path="$path"';
      expect(cloudBackup, contains(exclusion), reason: path);
      expect(deviceTransfer, contains(exclusion), reason: path);
    }
  });
}

String _elementBody(String xml, String elementName) =>
    RegExp(
      '<$elementName(?:\\s[^>]*)?>([\\s\\S]*?)</$elementName>',
    ).firstMatch(xml)?.group(1) ??
    '';

const _secureStoragePreferenceFiles = [
  'learnbox.reviewQueue.v1.xml',
  'FlutterSecureKeyStorage:learnbox.reviewQueue.v1.xml',
  'FlutterSecureStorageConfiguration:learnbox.reviewQueue.v1.xml',
  'FlutterSecureStorageConfiguration.xml',
];
