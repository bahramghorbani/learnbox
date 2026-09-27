import 'package:flutter/services.dart';

abstract interface class PronunciationPlayer {
  Future<void> playAsset(String assetPath);

  Future<void> stop();
}

final class MethodChannelPronunciationPlayer implements PronunciationPlayer {
  const MethodChannelPronunciationPlayer();

  static const _channel = MethodChannel('learnbox/pronunciation_v2');

  @override
  Future<void> playAsset(String assetPath) =>
      _channel.invokeMethod<void>('playAsset', {'assetPath': assetPath});

  @override
  Future<void> stop() => _channel.invokeMethod<void>('stop');
}
