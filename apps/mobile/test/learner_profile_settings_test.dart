import 'dart:async';
import 'dart:convert';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/pronunciation_player.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/sound_preference_store.dart';
import 'package:learnbox/features/review/start_card.dart';
import 'package:learnbox/features/review/start_pack_repository.dart';

void main() {
  testWidgets(
      'Profile shows the neutral account label and truthful zero pending state',
      (tester) async {
    await _pumpApp(tester);

    await _openProfile(tester);

    // Profile page title plus the active navigation label.
    expect(find.text('پروفایل'), findsNWidgets(2));
    expect(
      Directionality.of(tester.element(find.text('پروفایل').first)),
      TextDirection.rtl,
    );
    // Neutral account copy, never a fake person identity.
    expect(find.text('حساب LearnBox'), findsOneWidget);
    expect(find.byType(CircleAvatar), findsNothing);
    // Real device-local pending count: zero is stated truthfully.
    expect(find.text('رویدادی در انتظار همگام‌سازی نیست.'), findsOneWidget);
    // No sign-out, deletion, commerce, phone, reminders or sync fabrication.
    expect(find.textContaining('خروج'), findsNothing);
    expect(find.textContaining('حذف'), findsNothing);
    expect(find.textContaining('خرید'), findsNothing);
    expect(find.textContaining('اشتراک'), findsNothing);
    expect(find.textContaining('یادآور'), findsNothing);
    expect(find.textContaining('همگام‌سازی شد'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Profile pending count mirrors the real local review queue',
      (tester) async {
    final queue = ReviewQueue(
      store: SeededReviewQueueStore(events: const ['e1', 'e2']),
      idFactory: () => 'unused',
    );
    await _pumpApp(tester, queue: queue);

    await _openProfile(tester);

    expect(find.text('۲ رویداد در انتظار همگام‌سازی'), findsOneWidget);
    expect(find.text('رویدادی در انتظار همگام‌سازی نیست.'), findsNothing);
    // The count is announced as a complete Persian phrase, never a bare
    // number on its own.
    expect(
      tester.getSemantics(find.text('۲ رویداد در انتظار همگام‌سازی')).label,
      contains('۲ رویداد در انتظار همگام‌سازی'),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('a failed pending read stays calm and offers retry',
      (tester) async {
    final queue = ReviewQueue(
      store: FailingReviewQueueStore(),
      idFactory: () => 'unused',
    );
    await _pumpApp(tester, queue: queue);

    await _openProfile(tester);

    expect(
        find.text('وضعیت دستگاه خوانده نشد؛ دوباره تلاش کن.'), findsOneWidget);
    // Local account copy remains visible beside the failed read.
    expect(find.text('حساب LearnBox'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending read exposes a truthful loading announcement',
      (tester) async {
    final store = ControlledReviewQueueStore();
    final queue = ReviewQueue(store: store, idFactory: () => 'unused');
    await _pumpApp(tester, queue: queue);

    await _openProfile(tester, settle: false);

    final progress = find.byType(CircularProgressIndicator);
    expect(progress, findsOneWidget);
    expect(
      tester.getSemantics(progress).label,
      contains('در حال خواندن وضعیت دستگاه'),
    );
    store.complete(const []);
    await tester.pumpAndSettle();
    expect(find.text('رویدادی در انتظار همگام‌سازی نیست.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('retry recovers a failed pending read from the real local queue',
      (tester) async {
    final queue = ReviewQueue(
      store: RecoveringReviewQueueStore(events: const ['e1']),
      idFactory: () => 'unused',
    );
    await _pumpApp(tester, queue: queue);
    await _openProfile(tester);

    expect(
      find.text('وضعیت دستگاه خوانده نشد؛ دوباره تلاش کن.'),
      findsOneWidget,
    );
    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();

    expect(find.text('۱ رویداد در انتظار همگام‌سازی'), findsOneWidget);
    expect(
      find.text('وضعیت دستگاه خوانده نشد؛ دوباره تلاش کن.'),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Settings is a child surface with a labelled back action that restores '
      'focus to the Settings row', (tester) async {
    await _pumpApp(tester, soundPreferenceStore: _testSoundStore());
    await _openProfile(tester);

    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();

    expect(_primaryFocusInsideBackAction(), isTrue,
        reason: 'focus must land on the labelled back action');

    // Child surface covers the shell: no persistent navigation underneath.
    expect(find.text('امروز'), findsNothing);
    expect(find.text('پروفایل'), findsNothing);
    expect(find.text('تنظیمات'), findsOneWidget);
    expect(
      Directionality.of(tester.element(find.text('تنظیمات'))),
      TextDirection.rtl,
    );
    // Approved rows: the real device-local sound switch plus informational
    // text-size and language rows. No fake pickers, sliders or extra toggles.
    expect(find.text('پخش تلفظ'), findsOneWidget);
    expect(find.byType(Switch), findsOneWidget);
    expect(
      tester.widget<Switch>(find.byType(Switch)).value,
      isTrue,
      reason: 'sound defaults to enabled (safe default)',
    );
    expect(find.text('اندازهٔ متن'), findsOneWidget);
    expect(find.text('زبان'), findsOneWidget);
    expect(find.byType(Slider), findsNothing);
    expect(find.textContaining('خروج'), findsNothing);
    expect(tester.takeException(), isNull);

    // Labelled back action returns to Profile and restores focus to the
    // Settings row.
    await tester.tap(find.text('بازگشت به پروفایل'));
    await tester.pumpAndSettle();
    expect(find.text('پروفایل'), findsNWidgets(2));
    expect(find.text('امروز'), findsOneWidget);
    expect(_primaryFocusInsideSettingsRow(), isTrue,
        reason: 'focus must return to the Settings row');

    // System back behaves the same way.
    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('پروفایل'), findsNWidgets(2));
    expect(_primaryFocusInsideSettingsRow(), isTrue,
        reason: 'system back must restore focus to the Settings row');
    expect(tester.takeException(), isNull);
  });

  testWidgets('sound switch persists its choice and announces the save',
      (tester) async {
    final storage = _TestSoundPreferenceStorage();
    await _pumpApp(tester, soundPreferenceStore: _testSoundStore(storage));
    await _openProfile(tester);
    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();

    final switchFinder = find.byType(SwitchListTile);
    await tester.ensureVisible(switchFinder);
    await tester.pump();
    expect(find.text('پخش تلفظ'), findsOneWidget);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);

    final switchSemanticsData =
        tester.getSemantics(switchFinder).getSemanticsData();
    expect(switchSemanticsData.label, contains('پخش تلفظ'));
    expect(
      switchSemanticsData.flagsCollection.isToggled != Tristate.none,
      isTrue,
      reason: 'switch must announce it can be toggled (a11y)',
    );
    expect(
      switchSemanticsData.flagsCollection.isToggled == Tristate.isTrue,
      isTrue,
      reason: 'sound defaults to enabled, so the toggle is on',
    );

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
    expect(
      jsonDecode(storage.value!),
      {'version': 1, 'enabled': false},
      reason: 'the choice must persist as a versioned v1 record',
    );
    final savedStatus = find.text('تنظیم ذخیره شد.');
    expect(savedStatus, findsOneWidget);
    expect(
      tester
          .getSemantics(find.byKey(const ValueKey('sound-saved-live-region')))
          .getSemanticsData()
          .flagsCollection
          .isLiveRegion,
      isTrue,
      reason: 'save feedback must announce itself to screen readers',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed sound save reverts the switch and retry succeeds',
      (tester) async {
    final storage = _TestSoundPreferenceStorage(failNextWrites: 1);
    await _pumpApp(tester, soundPreferenceStore: _testSoundStore(storage));
    await _openProfile(tester);
    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();

    final switchFinder = find.byType(Switch);
    expect(tester.widget<Switch>(switchFinder).value, isTrue);
    await tester.tap(switchFinder);
    await tester.pumpAndSettle();

    // The failed save must revert: the switch never moved and the previous
    // state stays usable with a truthful error and retry action.
    expect(tester.widget<Switch>(switchFinder).value, isTrue);
    expect(storage.value, isNull);
    expect(
      find.text('ذخیرهٔ تنظیم انجام نشد؛ دوباره تلاش کن.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();

    expect(tester.widget<Switch>(switchFinder).value, isFalse);
    expect(jsonDecode(storage.value!), {'version': 1, 'enabled': false});
    expect(
      find.text('ذخیرهٔ تنظیم انجام نشد؛ دوباره تلاش کن.'),
      findsNothing,
    );
    expect(find.text('تنظیم ذخیره شد.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sound read failure keeps the safe enabled default with retry',
      (tester) async {
    final storage = _TestSoundPreferenceStorage(
      value: jsonEncode({'version': 1, 'enabled': false}),
      failNextReads: 1,
    );
    await _pumpApp(tester, soundPreferenceStore: _testSoundStore(storage));
    await _openProfile(tester);
    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();

    expect(
      find.text('خواندن تنظیم صدا انجام نشد؛ پخش صدا روشن فرض شد.'),
      findsOneWidget,
    );
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);

    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();

    expect(
      find.text('خواندن تنظیم صدا انجام نشد؛ پخش صدا روشن فرض شد.'),
      findsNothing,
    );
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse,
        reason: 'retry must read the real persisted choice');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'sound OFF removes every review audio control and blocks playback',
      (tester) async {
    final storage = _TestSoundPreferenceStorage(
      value: jsonEncode({'version': 1, 'enabled': true}),
    );
    final player = _RecordingPronunciationPlayer();
    await _pumpApp(
      tester,
      soundPreferenceStore: _testSoundStore(storage),
      pronunciationPlayer: player,
    );
    await _openProfile(tester);
    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);

    await tester.tap(find.text('بازگشت به پروفایل'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('امروز'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    expect(find.text('پخش تلفظ واژه'), findsNothing);
    expect(find.text('پخش جمله نمونه'), findsNothing);
    for (var card = 0; card < 3; card += 1) {
      await _tapVisibleText(tester, 'نمایش پاسخ');
      await tester.pumpAndSettle();
      expect(find.text('پخش جمله نمونه'), findsNothing,
          reason: 'card ${card + 1} must not offer audio while sound is off');
      await _tapVisibleText(tester, 'بلد بودم');
      await tester.pumpAndSettle();
    }
    expect(player.playedPaths, isEmpty,
        reason: 'OFF must prevent PronunciationPlayer.playAsset entirely');
    expect(tester.takeException(), isNull);
  });

  testWidgets('sound switch is a live control: ON restores working audio',
      (tester) async {
    final storage = _TestSoundPreferenceStorage(
      value: jsonEncode({'version': 1, 'enabled': false}),
    );
    final player = _RecordingPronunciationPlayer();
    await _pumpApp(
      tester,
      soundPreferenceStore: _testSoundStore(storage),
      pronunciationPlayer: player,
    );
    await _openProfile(tester);
    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
    expect(jsonDecode(storage.value!), {'version': 1, 'enabled': true});

    await tester.tap(find.text('بازگشت به پروفایل'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('امروز'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('پخش تلفظ واژه'));
    await tester.pump();
    expect(
        player.playedPaths, ['assets/audio/start-a1-haus-word-audio-v2.mp3']);
    await tester.tap(find.text('نمایش پاسخ'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('پخش جمله نمونه'));
    await tester.pump();
    expect(player.playedPaths, hasLength(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Profile and Settings keep one readable column at large text',
      (tester) async {
    await _pumpApp(
      tester,
      size: const Size(390, 844),
      textScaleFactor: 2,
    );
    await _openProfile(tester);
    expect(find.text('حساب LearnBox'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('زبان'));
    await tester.pump();
    expect(find.text('زبان'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Profile and Settings scroll on a short large-text viewport',
      (tester) async {
    await _pumpApp(
      tester,
      size: const Size(320, 360),
      textScaleFactor: 2,
    );
    await _openProfile(tester);
    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();

    for (final label in ['اندازهٔ متن', 'زبان']) {
      await tester.ensureVisible(find.text(label));
      await tester.pump();
      expect(find.text(label), findsOneWidget);
      expect(
        tester.getSize(find.text(label)).height,
        greaterThan(20),
        reason: label,
      );
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('Profile reflows without overflow in landscape', (tester) async {
    await _pumpApp(tester, size: const Size(844, 390));
    await _openProfile(tester);
    expect(find.text('حساب LearnBox'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Future<void> _pumpApp(
  WidgetTester tester, {
  ReviewQueue? queue,
  Size size = const Size(390, 844),
  double textScaleFactor = 1,
  SoundPreferenceStore? soundPreferenceStore,
  PronunciationPlayer? pronunciationPlayer,
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
      startPackRepository: _InMemoryStartPackRepository(),
      reviewQueue: queue ?? ReviewQueue(store: SeededReviewQueueStore()),
      pronunciationPlayer: pronunciationPlayer ?? _SilentPronunciationPlayer(),
      soundPreferenceStore: soundPreferenceStore ?? _testSoundStore(),
      splashDuration: Duration.zero,
    ),
  );
  await tester.pumpAndSettle();
}

SoundPreferenceStore _testSoundStore([_TestSoundPreferenceStorage? storage]) =>
    SoundPreferenceStore(storage: storage ?? _TestSoundPreferenceStorage());

Future<void> _openProfile(WidgetTester tester, {bool settle = true}) async {
  await tester.tap(find.text('پروفایل'));
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

Future<void> _tapSettingsRow(WidgetTester tester) async {
  await tester.ensureVisible(find.text('تنظیمات'));
  await tester.pump();
  await tester.tap(find.text('تنظیمات'));
}

bool _primaryFocusInsideSettingsRow() {
  final focus = FocusManager.instance.primaryFocus;
  if (focus == null || focus.context == null) {
    return false;
  }
  var inside = false;
  focus.context!.visitAncestorElements((element) {
    if (element.widget.key == const ValueKey('profile-settings-row')) {
      inside = true;
      return false;
    }
    return true;
  });
  return inside;
}

Future<void> _tapVisibleText(WidgetTester tester, String text) async {
  final target = find.text(text);
  await tester.ensureVisible(target);
  await tester.tap(target);
}

bool _primaryFocusInsideBackAction() {
  final focus = FocusManager.instance.primaryFocus;
  if (focus == null || focus.context == null) {
    return false;
  }
  return focus.context!.widget is TextButton ||
      focus.context!.findAncestorWidgetOfExactType<TextButton>() != null;
}

class SeededReviewQueueStore implements ReviewQueueStore {
  SeededReviewQueueStore({List<String> events = const []}) {
    value = jsonEncode({
      'schemaVersion': 1,
      'events': [
        for (final id in events)
          {
            'clientEventId': id,
            'cardId': 'start-a1-haus',
            'grade': 'remembered',
            'occurredAt': '2026-09-08T10:00:00.000Z',
          },
      ],
    });
  }

  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serializedEvents) async {
    value = serializedEvents;
  }
}

class FailingReviewQueueStore implements ReviewQueueStore {
  @override
  Future<String?> read() async =>
      throw StateError('synthetic local storage failure');

  @override
  Future<void> write(String serializedEvents) async {
    throw StateError('synthetic local storage failure');
  }
}

class ControlledReviewQueueStore implements ReviewQueueStore {
  final Completer<String?> _readCompleter = Completer<String?>();
  var _reads = 0;

  void complete(List<String> events) {
    _readCompleter.complete(_serializedEvents(events));
  }

  @override
  Future<String?> read() {
    _reads += 1;
    // Today reads once during app startup. Hold only Profile's second read.
    return _reads == 1
        ? Future.value(_serializedEvents(const []))
        : _readCompleter.future;
  }

  @override
  Future<void> write(String serializedEvents) async {}
}

class RecoveringReviewQueueStore implements ReviewQueueStore {
  RecoveringReviewQueueStore({required this.events});

  final List<String> events;
  var _reads = 0;

  @override
  Future<String?> read() async {
    _reads += 1;
    // Today performs the first read during startup; Profile performs the
    // second. Both fail before Profile's retry succeeds on the third read.
    if (_reads <= 2) {
      throw StateError('synthetic initial read failure');
    }
    return _serializedEvents(events);
  }

  @override
  Future<void> write(String serializedEvents) async {}
}

String _serializedEvents(List<String> events) => jsonEncode({
      'schemaVersion': 1,
      'events': [
        for (final id in events)
          {
            'clientEventId': id,
            'cardId': 'start-a1-haus',
            'grade': 'remembered',
            'occurredAt': '2026-09-08T10:00:00.000Z',
          },
      ],
    });

class _InMemoryStartPackRepository implements StartPackRepository {
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

class _SilentPronunciationPlayer implements PronunciationPlayer {
  @override
  Future<void> playAsset(String assetPath) async {}

  @override
  Future<void> stop() async {}
}

class _TestSoundPreferenceStorage implements SoundPreferenceStorage {
  _TestSoundPreferenceStorage({
    this.value,
    this.failNextReads = 0,
    this.failNextWrites = 0,
  });

  String? value;
  int failNextReads;
  int failNextWrites;

  @override
  Future<String?> read() async {
    if (failNextReads > 0) {
      failNextReads -= 1;
      throw StateError('synthetic sound storage read failure');
    }
    return value;
  }

  @override
  Future<void> write(String value) async {
    if (failNextWrites > 0) {
      failNextWrites -= 1;
      throw StateError('synthetic sound storage write failure');
    }
    this.value = value;
  }
}

class _RecordingPronunciationPlayer implements PronunciationPlayer {
  final playedPaths = <String>[];

  @override
  Future<void> playAsset(String assetPath) async {
    playedPaths.add(assetPath);
  }

  @override
  Future<void> stop() async {}
}
