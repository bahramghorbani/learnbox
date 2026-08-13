import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/bundled_start_pack_repository.dart';

void main() {
  test('loads the bundled daily session in its canonical three-card order',
      () async {
    const json = '''
      {"cards":[
        {"id":"start-a1-haus","german":"das Haus","persian":"خانه","definition":"Ein Gebäude, in dem Menschen wohnen.","example":{"german":"Das Haus ist klein.","persian":"خانه کوچک است."},"imageAsset":"assets/cards/start-a1-haus.png"},
        {"id":"start-a1-tisch","german":"der Tisch","persian":"میز","definition":"Ein Möbelstück mit einer flachen Fläche.","example":{"german":"Der Tisch ist groß.","persian":"میز بزرگ است."},"imageAsset":"assets/cards/start-a1-tisch.png"},
        {"id":"start-a1-tuer","german":"die Tür","persian":"در","definition":"Man öffnet und schließt sie, um in einen Raum zu gehen.","example":{"german":"Die Tür ist offen.","persian":"در باز است."},"imageAsset":"assets/cards/start-a1-tuer.png"}
      ]}
    ''';

    final cards = await BundledStartPackRepository.fromJsonString(json)
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

  test('rejects a bundle with malformed required card fields', () {
    const malformedJson = '''
      {"cards":[
        {"id":"start-a1-haus","german":"das Haus","persian":"خانه","definition":42,"example":{"german":"Das Haus ist klein.","persian":"خانه کوچک است."},"imageAsset":"assets/cards/start-a1-haus.png"}
      ]}
    ''';

    expect(
      () => BundledStartPackRepository.fromJsonString(malformedJson),
      throwsFormatException,
    );
  });
}
