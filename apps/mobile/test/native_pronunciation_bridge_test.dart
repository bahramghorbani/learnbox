import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/pronunciation_player.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('routes exact local asset paths through the pronunciation channel',
      () async {
    const channel = MethodChannel('learnbox/pronunciation_v2');
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      return null;
    });
    addTearDown(() => TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null));

    const player = MethodChannelPronunciationPlayer();
    await player.playAsset(
      'assets/audio/start-a1-haus-word-audio-v2.mp3',
    );
    await player.stop();

    expect(calls, hasLength(2));
    expect(calls.first.method, 'playAsset');
    expect(
      calls.first.arguments,
      {'assetPath': 'assets/audio/start-a1-haus-word-audio-v2.mp3'},
    );
    expect(calls.last.method, 'stop');
  });

  test('native hosts keep an exact V2 allowlist and no URL playback', () {
    final android = File(
      'android/app/src/main/kotlin/com/learnbox/learnbox/MainActivity.kt',
    ).readAsStringSync();
    final ios = File('ios/Runner/AppDelegate.swift').readAsStringSync();

    for (final source in [android, ios]) {
      expect(source, contains('learnbox/pronunciation_v2'));
      for (final path in _approvedPaths) {
        expect(source, contains(path));
      }
      expect(RegExp(r'assets/audio/[^"\n]+\.mp3').allMatches(source),
          hasLength(6));
      expect(source, isNot(contains('http://')));
      expect(source, isNot(contains('https://')));
    }
  });
}

const _approvedPaths = [
  'assets/audio/start-a1-haus-word-audio-v2.mp3',
  'assets/audio/start-a1-haus-sentence-audio-v2.mp3',
  'assets/audio/start-a1-tisch-word-audio-v2.mp3',
  'assets/audio/start-a1-tisch-sentence-audio-v2.mp3',
  'assets/audio/start-a1-tuer-word-audio-v2.mp3',
  'assets/audio/start-a1-tuer-sentence-audio-v2.mp3',
];
