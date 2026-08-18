/// Pure, offline resolver for the three canonical Start-card audio assets.
///
/// LB-DS-004: returns the exact already-approved V2 word and sentence asset
/// paths for `start-a1-haus`, `start-a1-tisch` and `start-a1-tuer`, and no
/// mapping for any unknown card id. The resolver is independent of platform
/// audio plugins and UI; it does not play audio and makes no network, storage,
/// sync, identity, provider, flag or release change.
abstract final class StartPackAudioAssets {
  static const _wordAssetPaths = <String, String>{
    'start-a1-haus': 'assets/audio/start-a1-haus-word-audio-v2.mp3',
    'start-a1-tisch': 'assets/audio/start-a1-tisch-word-audio-v2.mp3',
    'start-a1-tuer': 'assets/audio/start-a1-tuer-word-audio-v2.mp3',
  };

  static const _sentenceAssetPaths = <String, String>{
    'start-a1-haus': 'assets/audio/start-a1-haus-sentence-audio-v2.mp3',
    'start-a1-tisch': 'assets/audio/start-a1-tisch-sentence-audio-v2.mp3',
    'start-a1-tuer': 'assets/audio/start-a1-tuer-sentence-audio-v2.mp3',
  };

  /// Returns the word audio asset path for a known canonical Start-card id,
  /// or null for an unknown id.
  static String? wordPath(String cardId) => _wordAssetPaths[cardId];

  /// Returns the sentence audio asset path for a known canonical Start-card
  /// id, or null for an unknown id.
  static String? sentencePath(String cardId) => _sentenceAssetPaths[cardId];
}