import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/start_card.dart';
import 'package:learnbox/features/review/start_pack_repository.dart';

void main() {
  testWidgets(
    'Today starts active recall and waits for durable grading before advancing',
    (tester) async {
      final store = ControlledReviewQueueStore.blockingFirstWrite();
      final queue = ReviewQueue(store: store, idFactory: () => 'event-a');

      await _pumpApp(tester, queue: queue);

      expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
      expect(Directionality.of(tester.element(find.text('امروز'))),
          TextDirection.rtl);

      await tester.tap(find.text('شروع مرور'));
      await tester.pumpAndSettle();

      expect(find.text('das Haus'), findsOneWidget);
      expect(find.text('خانه'), findsNothing);

      await tester.tap(find.text('نمایش پاسخ'));
      await tester.pump();

      expect(find.text('خانه'), findsOneWidget);
      expect(find.text('Das Haus ist klein.'), findsOneWidget);
      expect(find.text('خانه کوچک است.'), findsOneWidget);

      await tester.tap(find.text('بلد بودم'));
      await store.firstWriteStarted.future;
      await tester.pump();

      expect(find.text('das Haus'), findsOneWidget);
      expect(find.text('der Tisch'), findsNothing);
      final rememberedButton = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'بلد بودم'),
      );
      expect(rememberedButton.onPressed, isNull);

      store.allowFirstWrite();
      await tester.pumpAndSettle();

      expect(_persistedGrades(store.value), ['remembered']);
      expect(find.text('der Tisch'), findsOneWidget);
    },
  );

  testWidgets('all four Persian labels persist their exact review grade',
      (tester) async {
    const expectedMappings = {
      'دوباره می‌خوانم': 'forgot',
      'سخت بود': 'hard',
      'بلد بودم': 'remembered',
      'خیلی آسان بود': 'mastered',
    };

    for (final entry in expectedMappings.entries) {
      final store = ControlledReviewQueueStore();
      final queue = ReviewQueue(store: store, idFactory: () => 'event-a');
      await _pumpApp(tester, queue: queue);
      await tester.tap(find.text('شروع مرور'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('نمایش پاسخ'));
      await tester.pump();

      await tester.tap(find.text(entry.key));
      await tester.pumpAndSettle();

      expect(_persistedGrades(store.value), [entry.value], reason: entry.key);
    }
  });

  testWidgets('grading all three cards shows calm completion and pending count',
      (tester) async {
    final ids = ['event-a', 'event-b', 'event-c'].iterator;
    final store = ControlledReviewQueueStore();
    final queue = ReviewQueue(
      store: store,
      idFactory: () {
        ids.moveNext();
        return ids.current;
      },
    );
    await _pumpApp(tester, queue: queue);
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    for (var index = 0; index < 3; index += 1) {
      await tester.tap(find.text('نمایش پاسخ'));
      await tester.pump();
      await tester.tap(find.text('بلد بودم'));
      await tester.pumpAndSettle();
    }

    expect(find.text('آفرین، مرور امروز تمام شد.'), findsOneWidget);
    expect(find.text('۳ پاسخ در این دستگاه آماده است.'), findsOneWidget);
    expect(await queue.pendingCount(), 3);
  });

  testWidgets('a storage error keeps the card open and offers a calm retry',
      (tester) async {
    final store = ControlledReviewQueueStore(failFirstWrite: true);
    final queue = ReviewQueue(store: store, idFactory: () => 'event-a');
    await _pumpApp(tester, queue: queue);
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('نمایش پاسخ'));
    await tester.pump();

    await tester.tap(find.text('سخت بود'));
    await tester.pumpAndSettle();

    expect(find.text('ذخیره انجام نشد؛ دوباره تلاش کن.'), findsOneWidget);
    expect(find.text('das Haus'), findsOneWidget);
    expect(find.text('خانه'), findsOneWidget);

    await tester.tap(find.text('سخت بود'));
    await tester.pumpAndSettle();

    expect(find.text('ذخیره انجام نشد؛ دوباره تلاش کن.'), findsNothing);
    expect(find.text('der Tisch'), findsOneWidget);
    expect(_persistedGrades(store.value), ['hard']);
  });
}

Future<void> _pumpApp(
  WidgetTester tester, {
  required ReviewQueue queue,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 844);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    LearnBoxApp(
      key: UniqueKey(),
      startPackRepository: InMemoryStartPackRepository(),
      reviewQueue: queue,
      splashDuration: Duration.zero,
    ),
  );
  await tester.pumpAndSettle();
}

List<String> _persistedGrades(String? serializedQueue) {
  final root = jsonDecode(serializedQueue!) as Map<String, dynamic>;
  final events = root['events'] as List<dynamic>;
  return events
      .map((event) => (event as Map<String, dynamic>)['grade'] as String)
      .toList();
}

class InMemoryStartPackRepository implements StartPackRepository {
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
        ),
        StartCard(
          id: 'start-a1-tisch',
          german: 'der Tisch',
          persian: 'میز',
          definition: 'Ein Möbelstück mit einer flachen Fläche.',
          exampleGerman: 'Der Tisch ist groß.',
          examplePersian: 'میز بزرگ است.',
          imageAsset: 'assets/cards/start-a1-tisch.png',
        ),
        StartCard(
          id: 'start-a1-tuer',
          german: 'die Tür',
          persian: 'در',
          definition: 'Man öffnet und schließt sie, um in einen Raum zu gehen.',
          exampleGerman: 'Die Tür ist offen.',
          examplePersian: 'در باز است.',
          imageAsset: 'assets/cards/start-a1-tuer.png',
        ),
      ];
}

class ControlledReviewQueueStore implements ReviewQueueStore {
  ControlledReviewQueueStore({this.failFirstWrite = false})
      : _firstWriteGate = null;

  ControlledReviewQueueStore.blockingFirstWrite()
      : failFirstWrite = false,
        _firstWriteGate = Completer<void>();

  final bool failFirstWrite;
  final Completer<void>? _firstWriteGate;
  final Completer<void> firstWriteStarted = Completer<void>();
  String? value;
  var _writeAttempts = 0;

  void allowFirstWrite() => _firstWriteGate?.complete();

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serializedEvents) async {
    _writeAttempts += 1;
    if (!firstWriteStarted.isCompleted) {
      firstWriteStarted.complete();
    }
    await _firstWriteGate?.future;
    if (failFirstWrite && _writeAttempts == 1) {
      throw StateError('synthetic secure storage failure');
    }
    value = serializedEvents;
  }
}
