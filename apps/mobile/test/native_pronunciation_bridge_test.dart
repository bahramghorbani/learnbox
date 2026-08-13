import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android bridge plays only bundled pronunciation assets', () async {
    final source = await File(
      'android/app/src/main/kotlin/com/learnbox/learnbox/MainActivity.kt',
    ).readAsString();

    expect(source, contains('com.learnbox.learnbox/pronunciation'));
    expect(source, contains('MediaPlayer'));
    expect(source, contains('flutter_assets/assets/'));
    expect(source, contains('start-a1-haus-word-audio-v1.mp3'));
    expect(source, isNot(contains('http')));
  });

  test('iOS bridge plays only bundled pronunciation assets', () async {
    final source = await File('ios/Runner/AppDelegate.swift').readAsString();

    expect(source, contains('com.learnbox.learnbox/pronunciation'));
    expect(source, contains('AVAudioPlayer'));
    expect(source, contains('flutter_assets/assets/'));
    expect(source, contains('start-a1-haus-word-audio-v1.mp3'));
    expect(source, isNot(contains('http')));
  });
}
