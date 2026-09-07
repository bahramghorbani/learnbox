import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/pronunciation_player.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
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

  testWidgets(
      'Settings is a child surface with a labelled back action that restores '
      'focus to the Settings row', (tester) async {
    await _pumpApp(tester);
    await _openProfile(tester);

    await _tapSettingsRow(tester);
    await tester.pumpAndSettle();

    // Child surface covers the shell: no persistent navigation underneath.
    expect(find.text('امروز'), findsNothing);
    expect(find.text('پروفایل'), findsNothing);
    expect(find.text('تنظیمات'), findsOneWidget);
    expect(
      Directionality.of(tester.element(find.text('تنظیمات'))),
      TextDirection.rtl,
    );
    // Approved informational rows only: text size follows the device and the
    // language is Persian. No fake pickers, toggles or sound persistence.
    expect(find.text('اندازهٔ متن'), findsOneWidget);
    expect(find.text('زبان'), findsOneWidget);
    expect(find.byType(Switch), findsNothing);
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
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.textScaleFactorTestValue = textScaleFactor;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(
    LearnBoxApp(
      key: UniqueKey(),
      startPackRepository: _InMemoryStartPackRepository(),
      reviewQueue: queue ?? ReviewQueue(store: SeededReviewQueueStore()),
      pronunciationPlayer: _SilentPronunciationPlayer(),
      splashDuration: Duration.zero,
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openProfile(WidgetTester tester) async {
  await tester.tap(find.text('پروفایل'));
  await tester.pumpAndSettle();
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
