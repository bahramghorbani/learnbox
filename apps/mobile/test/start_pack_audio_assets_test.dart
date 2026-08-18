import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/start_pack_audio_assets.dart';

void main() {
  group('StartPackAudioAssets', () {
    test('resolves the exact approved V2 word and sentence asset paths', () {
      // The three canonical Start cards (LB-DS-004): word audio is the
      // linguistically approved V2 clip carrying the full German phrase with
      // its article (e.g. `das Haus`); sentence audio is the full example.
      expect(
        StartPackAudioAssets.wordPath('start-a1-haus'),
        'assets/audio/start-a1-haus-word-audio-v2.mp3',
      );
      expect(
        StartPackAudioAssets.sentencePath('start-a1-haus'),
        'assets/audio/start-a1-haus-sentence-audio-v2.mp3',
      );
      expect(
        StartPackAudioAssets.wordPath('start-a1-tisch'),
        'assets/audio/start-a1-tisch-word-audio-v2.mp3',
      );
      expect(
        StartPackAudioAssets.sentencePath('start-a1-tisch'),
        'assets/audio/start-a1-tisch-sentence-audio-v2.mp3',
      );
      expect(
        StartPackAudioAssets.wordPath('start-a1-tuer'),
        'assets/audio/start-a1-tuer-word-audio-v2.mp3',
      );
      expect(
        StartPackAudioAssets.sentencePath('start-a1-tuer'),
        'assets/audio/start-a1-tuer-sentence-audio-v2.mp3',
      );
    });

    test('returns null for an unknown card id', () {
      expect(StartPackAudioAssets.wordPath('start-a1-unknown'), isNull);
      expect(StartPackAudioAssets.sentencePath('start-a1-unknown'), isNull);
    });

    test('is case-sensitive for known card ids', () {
      expect(StartPackAudioAssets.wordPath('START-A1-HAUS'), isNull);
      expect(StartPackAudioAssets.sentencePath('START-A1-HAUS'), isNull);
    });
  });
}