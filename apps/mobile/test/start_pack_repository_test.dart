import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/bundled_start_pack_repository.dart';

const canonicalBundleJson = '''
  {"cards":[
    {"id":"start-a1-haus","german":"das Haus","persian":"خانه","definition":"Ein Gebäude, in dem Menschen wohnen.","example":{"german":"Das Haus ist klein.","persian":"خانه کوچک است."},"imageAsset":"assets/cards/start-a1-haus.png"},
    {"id":"start-a1-tisch","german":"der Tisch","persian":"میز","definition":"Ein Möbelstück mit einer flachen Fläche.","example":{"german":"Der Tisch ist groß.","persian":"میز بزرگ است."},"imageAsset":"assets/cards/start-a1-tisch.png"},
    {"id":"start-a1-tuer","german":"die Tür","persian":"در","definition":"Man öffnet und schließt sie, um in einen Raum zu gehen.","example":{"german":"Die Tür ist offen.","persian":"در باز است."},"imageAsset":"assets/cards/start-a1-tuer.png"}
  ]}
''';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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

  test('Issue59 v2 word/sentence audio assets are bundled for the Start cards',
      () async {
    // Infrastructure check: the linguistically approved V2 clips (full German
    // phrase with article, e.g. `das Haus`) are present as mobile assets so a
    // future pronunciation player can resolve them without regeneration.
    const expectedAudioAssets = [
      'assets/audio/start-a1-haus-word-audio-v2.mp3',
      'assets/audio/start-a1-haus-sentence-audio-v2.mp3',
      'assets/audio/start-a1-tisch-word-audio-v2.mp3',
      'assets/audio/start-a1-tisch-sentence-audio-v2.mp3',
      'assets/audio/start-a1-tuer-word-audio-v2.mp3',
      'assets/audio/start-a1-tuer-sentence-audio-v2.mp3',
    ];

    for (final asset in expectedAudioAssets) {
      final data = await rootBundle.load(asset);
      expect(data.lengthInBytes, greaterThan(0), reason: '$asset is present');
    }
  });
}
