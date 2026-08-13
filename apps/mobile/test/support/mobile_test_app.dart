import 'package:flutter/widgets.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/start_card.dart';
import 'package:learnbox/features/review/start_pack_repository.dart';

Widget buildMobileTestApp({
  Duration splashDuration = const Duration(seconds: 3),
}) =>
    LearnBoxApp(
      startPackRepository: _TestStartPackRepository(),
      reviewQueue: ReviewQueue(
        store: _InMemoryReviewQueueStore(),
        idFactory: () => 'test-event',
      ),
      splashDuration: splashDuration,
    );

class _TestStartPackRepository implements StartPackRepository {
  @override
  Future<List<StartCard>> loadDailySession() async => const [
        StartCard(
          id: 'start-a1-haus',
          german: 'das Haus',
          persian: 'خانه',
          definition: 'Ein Gebäude, in dem Menschen wohnen.',
          exampleGerman: 'Das Haus ist klein.',
          examplePersian: 'خانه کوچک است.',
          imageAsset: 'assets/cards/start-a1-haus.png',
          wordAudioAsset: 'audio/start-a1-haus-word-audio-v1.mp3',
          sentenceAudioAsset: 'audio/start-a1-haus-sentence-audio-v1.mp3',
        ),
        StartCard(
          id: 'start-a1-tisch',
          german: 'der Tisch',
          persian: 'میز',
          definition: 'Ein Möbelstück mit einer flachen Fläche.',
          exampleGerman: 'Der Tisch ist groß.',
          examplePersian: 'میز بزرگ است.',
          imageAsset: 'assets/cards/start-a1-tisch.png',
          wordAudioAsset: 'audio/start-a1-tisch-word-audio-v1.mp3',
          sentenceAudioAsset: 'audio/start-a1-tisch-sentence-audio-v1.mp3',
        ),
        StartCard(
          id: 'start-a1-tuer',
          german: 'die Tür',
          persian: 'در',
          definition: 'Man öffnet und schließt sie, um in einen Raum zu gehen.',
          exampleGerman: 'Die Tür ist offen.',
          examplePersian: 'در باز است.',
          imageAsset: 'assets/cards/start-a1-tuer.png',
          wordAudioAsset: 'audio/start-a1-tuer-word-audio-v1.mp3',
          sentenceAudioAsset: 'audio/start-a1-tuer-sentence-audio-v1.mp3',
        ),
      ];
}

class _InMemoryReviewQueueStore implements ReviewQueueStore {
  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String serializedEvents) async {
    _value = serializedEvents;
  }
}
