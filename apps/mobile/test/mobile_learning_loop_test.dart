import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/pronunciation_player.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/secure_review_queue_store.dart';
import 'package:learnbox/features/review/start_card.dart';
import 'package:learnbox/features/review/start_pack_repository.dart';

void main() {
  testWidgets('routes approved word and revealed sentence audio paths',
      (tester) async {
    final player = RecordingPronunciationPlayer();
    final queue = ReviewQueue(
      store: ControlledReviewQueueStore(),
      idFactory: () => 'event-a',
    );
    await _pumpApp(tester, queue: queue, pronunciationPlayer: player);
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    expect(find.text('پخش تلفظ واژه'), findsOneWidget);
    expect(
      tester
          .getSize(find.widgetWithText(OutlinedButton, 'پخش تلفظ واژه'))
          .height,
      greaterThanOrEqualTo(56),
    );
    expect(
      tester
          .getSemantics(
            find.widgetWithText(OutlinedButton, 'پخش تلفظ واژه'),
          )
          .label,
      'پخش تلفظ واژه',
    );
    expect(find.text('پخش جمله نمونه'), findsNothing);
    await tester.tap(find.text('پخش تلفظ واژه'));
    await tester.pump();
    expect(
      player.playedPaths,
      ['assets/audio/start-a1-haus-word-audio-v2.mp3'],
    );

    await _tapVisibleText(tester, 'نمایش پاسخ');
    await tester.pump();
    expect(find.text('پخش جمله نمونه'), findsOneWidget);
    expect(
      tester
          .getSize(
            find.widgetWithText(OutlinedButton, 'پخش جمله نمونه'),
          )
          .height,
      greaterThanOrEqualTo(56),
    );
    expect(
      tester
          .getSemantics(
            find.widgetWithText(OutlinedButton, 'پخش جمله نمونه'),
          )
          .label,
      'پخش جمله نمونه',
    );
    await tester.tap(find.text('پخش جمله نمونه'));
    await tester.pump();
    expect(
      player.playedPaths,
      [
        'assets/audio/start-a1-haus-word-audio-v2.mp3',
        'assets/audio/start-a1-haus-sentence-audio-v2.mp3',
      ],
    );
  });

  testWidgets('allows only one platform audio start request at a time',
      (tester) async {
    final player = BlockingPronunciationPlayer();
    final queue = ReviewQueue(
      store: ControlledReviewQueueStore(),
      idFactory: () => 'event-a',
    );
    await _pumpApp(tester, queue: queue, pronunciationPlayer: player);
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('پخش تلفظ واژه'));
    await tester.pump();
    expect(
      tester
          .widget<OutlinedButton>(
            find.widgetWithText(OutlinedButton, 'پخش تلفظ واژه'),
          )
          .onPressed,
      isNull,
    );
    expect(player.playedPaths, hasLength(1));

    player.allowPlay();
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<OutlinedButton>(
            find.widgetWithText(OutlinedButton, 'پخش تلفظ واژه'),
          )
          .onPressed,
      isNotNull,
    );
  });

  testWidgets('audio failure stays calm and never blocks grading',
      (tester) async {
    final player = RecordingPronunciationPlayer(failNextPlay: true);
    final store = ControlledReviewQueueStore();
    final queue = ReviewQueue(store: store, idFactory: () => 'event-a');
    await _pumpApp(tester, queue: queue, pronunciationPlayer: player);
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('پخش تلفظ واژه'));
    await tester.pumpAndSettle();
    expect(find.text('پخش صدا انجام نشد؛ دوباره تلاش کن.'), findsOneWidget);

    await _tapVisibleText(tester, 'نمایش پاسخ');
    await tester.pump();
    await _tapVisibleText(tester, 'بلد بودم');
    await tester.pumpAndSettle();
    expect(_persistedGrades(store.value), ['remembered']);
    expect(find.text('der Tisch'), findsOneWidget);
    expect(player.stopCalls, 1);
  });

  testWidgets(
    'Today starts active recall and waits for durable grading before advancing',
    (tester) async {
      final store = ControlledReviewQueueStore.blockingFirstWrite();
      final queue = ReviewQueue(store: store, idFactory: () => 'event-a');

      await _pumpApp(tester, queue: queue);

      expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
      // "امروز" appears both as the heading and as the active bottom-navigation
      // label; the heading keeps the RTL directionality.
      expect(Directionality.of(tester.element(find.text('امروز').first)),
          TextDirection.rtl);

      await tester.tap(find.text('شروع مرور'));
      await tester.pumpAndSettle();

      expect(find.text('das Haus'), findsOneWidget);
      expect(find.text('خانه'), findsNothing);

      await _tapVisibleText(tester, 'نمایش پاسخ');
      await tester.pump();

      expect(find.text('خانه'), findsOneWidget);
      expect(find.text('Das Haus ist klein.'), findsOneWidget);
      expect(find.text('خانه کوچک است.'), findsOneWidget);

      await _tapVisibleText(tester, 'بلد بودم');
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
      await _tapVisibleText(tester, 'نمایش پاسخ');
      await tester.pump();

      await _tapVisibleText(tester, entry.key);
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
      await _tapVisibleText(tester, 'نمایش پاسخ');
      await tester.pump();
      await _tapVisibleText(tester, 'بلد بودم');
      await tester.pumpAndSettle();
    }

    expect(find.text('آفرین، مرور امروز تمام شد.'), findsOneWidget);
    expect(find.text('۳ پاسخ در این دستگاه آماده است.'), findsOneWidget);
    expect(await queue.pendingCount(), 3);

    await tester.tap(find.text('بازگشت به امروز'));
    await tester.pumpAndSettle();

    expect(find.text('امروز'), findsNWidgets(2));
    expect(find.text('آفرین، مرور امروز تمام شد.'), findsNothing);
  });

  testWidgets('a storage error keeps the card open and offers a calm retry',
      (tester) async {
    final store = ControlledReviewQueueStore(failFirstWrite: true);
    final queue = ReviewQueue(store: store, idFactory: () => 'event-a');
    await _pumpApp(tester, queue: queue);
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();
    await _tapVisibleText(tester, 'نمایش پاسخ');
    await tester.pump();

    await _tapVisibleText(tester, 'سخت بود');
    await tester.pumpAndSettle();

    expect(find.text('ذخیره انجام نشد؛ دوباره تلاش کن.'), findsOneWidget);
    expect(find.text('das Haus'), findsOneWidget);
    expect(find.text('خانه'), findsOneWidget);

    await _tapVisibleText(tester, 'سخت بود');
    await tester.pumpAndSettle();

    expect(find.text('ذخیره انجام نشد؛ دوباره تلاش کن.'), findsNothing);
    expect(find.text('der Tisch'), findsOneWidget);
    expect(_persistedGrades(store.value), ['hard']);
  });

  testWidgets(
    'secure-storage failures propagate without reset and keep retry UI visible',
    (tester) async {
      const channel = MethodChannel(
        'plugins.it_nomads.com/flutter_secure_storage',
      );
      final calls = <MethodCall>[];
      var writeAttempts = 0;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        (call) async {
          calls.add(call);
          if (call.method == 'read') {
            return null;
          }
          if (call.method == 'write') {
            writeAttempts += 1;
            if (writeAttempts == 1) {
              throw PlatformException(
                code: 'synthetic_storage_failure',
                message: 'The encrypted value could not be written.',
              );
            }
            return null;
          }
          throw StateError('Unexpected secure-storage call: ${call.method}');
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null),
      );

      final queue = ReviewQueue(store: SecureReviewQueueStore());
      await _pumpApp(tester, queue: queue);
      await tester.tap(find.text('شروع مرور'));
      await tester.pumpAndSettle();
      await _tapVisibleText(tester, 'نمایش پاسخ');
      await tester.pump();

      await _tapVisibleText(tester, 'سخت بود');
      await tester.pumpAndSettle();

      expect(find.text('ذخیره انجام نشد؛ دوباره تلاش کن.'), findsOneWidget);
      expect(find.text('das Haus'), findsOneWidget);
      expect(calls.map((call) => call.method), ['read', 'read', 'write']);
      final writeArguments = calls.last.arguments as Map<Object?, Object?>;
      expect(writeArguments['key'], 'learnbox.reviewQueue.v1');
      expect(writeArguments['options'], containsPair('resetOnError', 'false'));
      expect(
        writeArguments['options'],
        containsPair('migrateOnAlgorithmChange', 'true'),
      );
      expect(
        writeArguments['options'],
        containsPair('migrateWithBackup', 'true'),
      );
      expect(
        writeArguments['options'],
        containsPair('storageNamespace', 'learnbox.reviewQueue.v1'),
      );
      expect(calls.where((call) => call.method.startsWith('delete')), isEmpty);

      await _tapVisibleText(tester, 'سخت بود');
      await tester.pumpAndSettle();

      expect(find.text('ذخیره انجام نشد؛ دوباره تلاش کن.'), findsNothing);
      expect(find.text('der Tisch'), findsOneWidget);
      expect(calls.where((call) => call.method.startsWith('delete')), isEmpty);
    },
  );

  testWidgets('Today remains scrollable at large text on a short viewport',
      (tester) async {
    final queue = ReviewQueue(store: ControlledReviewQueueStore());
    await _pumpApp(
      tester,
      queue: queue,
      size: const Size(320, 360),
      textScaleFactor: 2,
    );

    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.pump();
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today reflows without overflow in landscape', (tester) async {
    final queue = ReviewQueue(store: ControlledReviewQueueStore());
    await _pumpApp(
      tester,
      queue: queue,
      size: const Size(844, 390),
    );

    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('review keeps every Persian grade label readable at large text',
      (tester) async {
    final queue = ReviewQueue(store: ControlledReviewQueueStore());
    await _pumpApp(
      tester,
      queue: queue,
      size: const Size(320, 480),
      textScaleFactor: 2,
    );
    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.pump();
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();
    await _tapVisibleText(tester, 'نمایش پاسخ');
    await tester.pump();

    for (final label in [
      'دوباره می‌خوانم',
      'سخت بود',
      'بلد بودم',
      'خیلی آسان بود',
    ]) {
      await tester.ensureVisible(find.text(label));
      await tester.pump();
      expect(find.text(label), findsOneWidget);
      expect(tester.getSize(find.text(label)).height, greaterThan(30));
      final button = find.ancestor(
        of: find.text(label),
        matching: find.byType(FilledButton),
      );
      final buttonRect = tester.getRect(button);
      final labelRect = tester.getRect(find.text(label));
      expect(
        buttonRect.contains(labelRect.topLeft),
        isTrue,
        reason: '$label: button=$buttonRect label=$labelRect',
      );
      expect(
        buttonRect.contains(labelRect.bottomRight),
        isTrue,
        reason: '$label: button=$buttonRect label=$labelRect',
      );
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('review completion scrolls on a short large-text viewport',
      (tester) async {
    final ids = ['event-a', 'event-b', 'event-c'].iterator;
    final queue = ReviewQueue(
      store: ControlledReviewQueueStore(),
      idFactory: () {
        ids.moveNext();
        return ids.current;
      },
    );
    await _pumpApp(
      tester,
      queue: queue,
      size: const Size(320, 300),
      textScaleFactor: 2,
    );
    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.pump();
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    for (var index = 0; index < 3; index += 1) {
      await tester.ensureVisible(find.text('نمایش پاسخ'));
      await tester.pump();
      await _tapVisibleText(tester, 'نمایش پاسخ');
      await tester.pump();
      await tester.ensureVisible(find.text('بلد بودم'));
      await tester.pump();
      await _tapVisibleText(tester, 'بلد بودم');
      await tester.pumpAndSettle();
    }

    await tester.ensureVisible(find.text('آفرین، مرور امروز تمام شد.'));
    await tester.pump();
    expect(find.text('۳ پاسخ در این دستگاه آماده است.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'redesigned Today still starts active recall and reveals the German card',
      (tester) async {
    final queue = ReviewQueue(store: ControlledReviewQueueStore());
    await _pumpApp(tester, queue: queue);

    // The visual Today composition keeps the offline session contract.
    expect(find.text('امروز'), findsNWidgets(2));
    expect(find.text('شروع مرور'), findsOneWidget);

    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    expect(find.text('das Haus'), findsOneWidget);
    expect(find.text('خانه'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

Future<void> _pumpApp(
  WidgetTester tester, {
  required ReviewQueue queue,
  PronunciationPlayer? pronunciationPlayer,
  Size size = const Size(390, 844),
  double textScaleFactor = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.textScaleFactorTestValue = textScaleFactor;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(
    tester.platformDispatcher.clearTextScaleFactorTestValue,
  );
  await tester.pumpWidget(
    LearnBoxApp(
      key: UniqueKey(),
      startPackRepository: InMemoryStartPackRepository(),
      reviewQueue: queue,
      pronunciationPlayer:
          pronunciationPlayer ?? RecordingPronunciationPlayer(),
      splashDuration: Duration.zero,
    ),
  );
  await tester.pumpAndSettle();
}

class RecordingPronunciationPlayer implements PronunciationPlayer {
  RecordingPronunciationPlayer({this.failNextPlay = false});

  bool failNextPlay;
  final playedPaths = <String>[];
  var stopCalls = 0;

  @override
  Future<void> playAsset(String assetPath) async {
    if (failNextPlay) {
      failNextPlay = false;
      throw PlatformException(code: 'synthetic_playback_failure');
    }
    playedPaths.add(assetPath);
  }

  @override
  Future<void> stop() async {
    stopCalls += 1;
  }
}

class BlockingPronunciationPlayer implements PronunciationPlayer {
  final playedPaths = <String>[];
  final _playCompleter = Completer<void>();

  void allowPlay() => _playCompleter.complete();

  @override
  Future<void> playAsset(String assetPath) {
    playedPaths.add(assetPath);
    return _playCompleter.future;
  }

  @override
  Future<void> stop() async {}
}

List<String> _persistedGrades(String? serializedQueue) {
  final root = jsonDecode(serializedQueue!) as Map<String, dynamic>;
  final events = root['events'] as List<dynamic>;
  return events
      .map((event) => (event as Map<String, dynamic>)['grade'] as String)
      .toList();
}

Future<void> _tapVisibleText(WidgetTester tester, String text) async {
  final target = find.text(text);
  await tester.ensureVisible(target);
  await tester.tap(target);
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
