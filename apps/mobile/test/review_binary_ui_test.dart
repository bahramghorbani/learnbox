import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/binary_response.dart';
import 'package:learnbox/features/review/pronunciation_player.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/review_screen.dart';
import 'package:learnbox/features/review/start_card.dart';

/// CP16 Stage 3 — the learner-facing binary interaction, driven through the UI.
void main() {
  Future<void> pumpReview(
    WidgetTester tester, {
    required ReviewQueue queue,
    required bool binary,
  }) async {
    await tester.pumpWidget(MaterialApp(
      home: ReviewScreen(
        cards: const [
          StartCard(
            id: 'start-a1-haus',
            german: 'das Haus',
            persian: 'خانه',
            definition: 'ساختمانی برای زندگی',
            exampleGerman: 'Das Haus ist groß.',
            examplePersian: 'خانه بزرگ است.',
            imageAsset: 'assets/cards/start-a1-haus.jpg',
          ),
        ],
        reviewQueue: queue,
        pronunciationPlayer: _SilentPlayer(),
        binaryReviewUi: binary,
      ),
    ));
    await tester.pumpAndSettle();
  }

  /// Reveal the answer so the response controls are shown.
  Future<void> revealAnswer(WidgetTester tester) async {
    final reveal = find.text('نمایش پاسخ');
    expect(reveal, findsOneWidget);
    await tester.ensureVisible(reveal);
    await tester.tap(reveal);
    await tester.pumpAndSettle();
  }

  testWidgets('binary build shows exactly two choices, matching Web wording',
      (tester) async {
    final queue = ReviewQueue(store: _MemoryStore(), idFactory: () => 'ui-1');
    await pumpReview(tester, queue: queue, binary: true);
    await revealAnswer(tester);

    expect(find.text('بلد بودم'), findsOneWidget);
    expect(find.text('بلد نیستم'), findsOneWidget);
    // The four-grade labels must be gone.
    expect(find.text('سخت بود'), findsNothing);
    expect(find.text('دوباره می‌خوانم'), findsNothing);
    expect(find.text('خیلی آسان بود'), findsNothing);
  });

  testWidgets('tapping «بلد بودم» queues explicit known evidence',
      (tester) async {
    final queue = ReviewQueue(store: _MemoryStore(), idFactory: () => 'ui-2');
    await pumpReview(tester, queue: queue, binary: true);
    await revealAnswer(tester);

    await tester.ensureVisible(find.text('بلد بودم'));
    await tester.tap(find.text('بلد بودم'));
    await tester.pumpAndSettle();

    final event = (await queue.pendingEvents()).single;
    expect(event.response, BinaryResponse.known);
    expect(event.grade.name, 'remembered');
    expect(event.cardId, 'start-a1-haus');
  });

  testWidgets('tapping «بلد نیستم» queues explicit unknown evidence',
      (tester) async {
    final queue = ReviewQueue(store: _MemoryStore(), idFactory: () => 'ui-3');
    await pumpReview(tester, queue: queue, binary: true);
    await revealAnswer(tester);

    await tester.ensureVisible(find.text('بلد نیستم'));
    await tester.tap(find.text('بلد نیستم'));
    await tester.pumpAndSettle();

    final event = (await queue.pendingEvents()).single;
    expect(event.response, BinaryResponse.unknown);
    expect(event.grade.name, 'forgot');
  });

  testWidgets('legacy build keeps four grades and records no binary response',
      (tester) async {
    final queue = ReviewQueue(store: _MemoryStore(), idFactory: () => 'ui-4');
    await pumpReview(tester, queue: queue, binary: false);
    await revealAnswer(tester);

    expect(find.text('سخت بود'), findsOneWidget);
    expect(find.text('بلد نیستم'), findsNothing);

    await tester.ensureVisible(find.text('سخت بود'));
    await tester.tap(find.text('سخت بود'));
    await tester.pumpAndSettle();

    final event = (await queue.pendingEvents()).single;
    expect(event.response, isNull);
    expect(event.grade.name, 'hard');
  });
}

class _MemoryStore implements ReviewQueueStore {
  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String serializedEvents) async {
    _value = serializedEvents;
  }
}

class _SilentPlayer implements PronunciationPlayer {
  @override
  Future<void> playAsset(String assetPath) async {}

  @override
  Future<void> stop() async {}
}
