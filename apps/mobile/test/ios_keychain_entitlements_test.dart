import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('iOS Runner entitlements enable Keychain Sharing', () async {
    for (final relativePath in [
      'ios/Runner/DebugProfile.entitlements',
      'ios/Runner/Release.entitlements',
    ]) {
      final file = File(relativePath);
      expect(file.existsSync(), isTrue, reason: relativePath);
      final contents = await file.readAsString();
      expect(contents, contains('<key>keychain-access-groups</key>'));
      expect(contents, contains('<array/>'));
    }
  });

  test('iOS Runner links entitlements in Debug, Profile and Release', () async {
    final project =
        await File('ios/Runner.xcodeproj/project.pbxproj').readAsString();
    final byName = {
      'Debug': _configuration(project, '97C147061CF9000F007C117D', 'Debug'),
      'Profile': _configuration(project, '249021D4217E4FDB00AE95B9', 'Profile'),
      'Release': _configuration(project, '97C147071CF9000F007C117D', 'Release'),
    };

    expect(byName.keys, containsAll(['Debug', 'Profile', 'Release']));
    expect(
      byName['Debug'],
      contains('CODE_SIGN_ENTITLEMENTS = Runner/DebugProfile.entitlements;'),
    );
    expect(
      byName['Profile'],
      contains('CODE_SIGN_ENTITLEMENTS = Runner/DebugProfile.entitlements;'),
    );
    expect(
      byName['Release'],
      contains('CODE_SIGN_ENTITLEMENTS = Runner/Release.entitlements;'),
    );
  });
}

String _configuration(String project, String id, String name) =>
    RegExp(
      '$id /\\* $name \\*/ = \\{[\\s\\S]*?name = $name;\\n\\s*\\};',
    ).firstMatch(project)?.group(0) ??
    '';
