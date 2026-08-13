import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/bundled_start_pack_repository.dart';

const canonicalBundleJson = '''
  {"cards":[
    {"id":"start-a1-haus","german":"das Haus","persian":"خانه","definition":"Ein Gebäude, in dem Menschen wohnen.","example":{"german":"Das Haus ist klein.","persian":"خانه کوچک است."},"imageAsset":"assets/cards/start-a1-haus.png","wordAudioAsset":"audio/start-a1-haus-word-audio-v1.mp3","sentenceAudioAsset":"audio/start-a1-haus-sentence-audio-v1.mp3"},
    {"id":"start-a1-tisch","german":"der Tisch","persian":"میز","definition":"Ein Möbelstück mit einer flachen Fläche.","example":{"german":"Der Tisch ist groß.","persian":"میز بزرگ است."},"imageAsset":"assets/cards/start-a1-tisch.png","wordAudioAsset":"audio/start-a1-tisch-word-audio-v1.mp3","sentenceAudioAsset":"audio/start-a1-tisch-sentence-audio-v1.mp3"},
    {"id":"start-a1-tuer","german":"die Tür","persian":"در","definition":"Man öffnet und schließt sie, um in einen Raum zu gehen.","example":{"german":"Die Tür ist offen.","persian":"در باز است."},"imageAsset":"assets/cards/start-a1-tuer.png","wordAudioAsset":"audio/start-a1-tuer-word-audio-v1.mp3","sentenceAudioAsset":"audio/start-a1-tuer-sentence-audio-v1.mp3"}
  ]}
''';

void main() {
  test('loads the bundled daily session in its canonical three-card order',
      () async {
    final cards =
        await BundledStartPackRepository.fromJsonString(canonicalBundleJson)
            .loadDailySession();

    expect(cards.map((card) => card.id), [
      'start-a1-haus',
      'start-a1-tisch',
      'start-a1-tuer',
    ]);
    expect(cards.first.german, 'das Haus');
    expect(cards.first.examplePersian, 'خانه کوچک است.');
    expect(cards.first.wordAudioAsset, 'audio/start-a1-haus-word-audio-v1.mp3');
    expect(() => cards.add(cards.first), throwsUnsupportedError);
  });

  test(
      'rejects a malformed definition after validating the complete daily session',
      () {
    final malformedJson = canonicalBundleJson.replaceFirst(
      '"definition":"Ein Gebäude, in dem Menschen wohnen."',
      '"definition":42',
    );

    expect(
      () => BundledStartPackRepository.fromJsonString(malformedJson),
      throwsFormatException,
    );
  });

  test('rejects a card without its versioned word-audio asset', () {
    final missingAudioJson = canonicalBundleJson.replaceFirst(
      '"wordAudioAsset":"audio/start-a1-haus-word-audio-v1.mp3",',
      '',
    );

    expect(
      () => BundledStartPackRepository.fromJsonString(missingAudioJson),
      throwsFormatException,
    );
  });
}
