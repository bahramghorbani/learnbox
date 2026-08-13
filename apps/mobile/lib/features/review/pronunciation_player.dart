import 'package:flutter/services.dart';

const _pronunciationChannel = MethodChannel(
  'com.learnbox.learnbox/pronunciation',
);

const _bundledPronunciationAssets = <String>{
  'audio/start-a1-haus-word-audio-v1.mp3',
  'audio/start-a1-haus-sentence-audio-v1.mp3',
  'audio/start-a1-tisch-word-audio-v1.mp3',
  'audio/start-a1-tisch-sentence-audio-v1.mp3',
  'audio/start-a1-tuer-word-audio-v1.mp3',
  'audio/start-a1-tuer-sentence-audio-v1.mp3',
};

abstract interface class PronunciationPlayer {
  Future<void> playAsset(String assetPath);

  Future<void> dispose();
}

class MethodChannelPronunciationPlayer implements PronunciationPlayer {
  const MethodChannelPronunciationPlayer();

  @override
  Future<void> playAsset(String assetPath) async {
    if (!_bundledPronunciationAssets.contains(assetPath)) {
      throw ArgumentError.value(
        assetPath,
        'assetPath',
        'Only bundled pronunciation assets are supported.',
      );
    }

    await _pronunciationChannel.invokeMethod<void>('playAsset', {
      'assetPath': assetPath,
    });
  }

  @override
  Future<void> dispose() => _pronunciationChannel.invokeMethod<void>('dispose');
}
