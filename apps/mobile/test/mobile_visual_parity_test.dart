import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/completion_screen.dart';
import 'package:learnbox/features/review/review_queue.dart';

import 'mobile_learning_loop_test.dart'
    show ControlledReviewQueueStore, InMemoryStartPackRepository;

void main() {
  testWidgets(
      'Today shows title, count and primary action in a readable layout',
      (tester) async {
    await _pumpApp(tester);

    // "امروز" appears as the heading and as the active bottom-navigation
    // label, so it is present exactly twice.
    expect(find.text('امروز'), findsNWidgets(2));
    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('decorative Bobo is excluded from semantics when shown',
      (tester) async {
    await _pumpApp(tester, size: const Size(390, 844));

    final bobo = find.byType(Image);
    expect(bobo, findsOneWidget);
    // The encouraging Bobo is decorative: its asset must not be exposed to
    // screen readers as meaningful content.
    final image = tester.widget<Image>(bobo);
    expect(image.excludeFromSemantics, isTrue);
  });

  testWidgets('Words destination shows a truthful unavailable notice',
      (tester) async {
    await _pumpApp(tester);

    await tester.tap(find.text('واژه‌ها'));
    await tester.pump();

    expect(
      find.text('این بخش به‌زودی در اپ موبایل آماده می‌شود.'),
      findsOneWidget,
    );
  });

  testWidgets('Progress destination shows a truthful unavailable notice',
      (tester) async {
    await _pumpApp(tester);

    await tester.tap(find.text('پیشرفت'));
    await tester.pump();

    expect(
      find.text('این بخش به‌زودی در اپ موبایل آماده می‌شود.'),
      findsOneWidget,
    );
  });

  testWidgets('primary action remains discoverable on a short large-text view',
      (tester) async {
    await _pumpApp(
      tester,
      size: const Size(320, 360),
      textScaleFactor: 2,
    );

    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.pump();
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'review keeps German LTR and grade controls readable on a narrow large-text view',
      (tester) async {
    await _pumpApp(
      tester,
      size: const Size(320, 480),
      textScaleFactor: 2,
    );

    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    final german = find.text('das Haus');
    expect(german, findsOneWidget);
    expect(Directionality.of(tester.element(german)), TextDirection.ltr);

    await tester.ensureVisible(find.text('نمایش پاسخ'));
    await tester.tap(find.text('نمایش پاسخ'));
    await tester.pumpAndSettle();

    // The media and revealed answer are separate readable surfaces.
    expect(find.byType(Card), findsNWidgets(2));

    for (final label in [
      'دوباره می‌خوانم',
      'سخت بود',
      'بلد بودم',
      'خیلی آسان بود',
    ]) {
      final button = find.text(label);
      await tester.ensureVisible(button);
      expect(tester.getRect(button).height, greaterThan(0));
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'completion shows canonical celebrate Bobo, truthful pending count and a return action',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CompletionScreen(
          pendingCount: 3,
          storageError: null,
          onReturnToToday: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The canonical celebration Bobo exposes a semantic label (LB-DS-003).
    expect(
      find.bySemanticsLabel('بوبو موفقیت تو را جشن می‌گیرد'),
      findsOneWidget,
    );
    // The truthful local pending count is still visible.
    expect(find.text('۳ پاسخ در این دستگاه آماده است.'), findsOneWidget);
    // A single return-to-Today action is present, at least 56px tall.
    expect(find.text('بازگشت به امروز'), findsOneWidget);
    expect(
      tester.getSize(find.byType(FilledButton)).height,
      greaterThanOrEqualTo(56),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'reviewing all three cards and returning lands back on the Today screen',
      (tester) async {
    // Full-path test (PR #73 review): grade all three cards from Today, tap
    // the return action, and verify the Today shell is shown again. This
    // proves ReviewScreen actually pops back to the first route.
    await _pumpApp(tester);

    await _completeDailyReview(tester);

    expect(find.text('آفرین، مرور امروز تمام شد.'), findsOneWidget);

    await tester.tap(find.text('بازگشت به امروز'));
    await tester.pumpAndSettle();

    // Back on the Today shell.
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(find.text('آفرین، مرور امروز تمام شد.'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

/// Grades all three cards to reach the daily-completion surface.
Future<void> _completeDailyReview(WidgetTester tester) async {
  await tester.tap(find.text('شروع مرور'));
  await tester.pumpAndSettle();
  await tester.pump(const Duration(milliseconds: 400));
  expect(find.text('das Haus'), findsOneWidget, reason: 'card 1 shown');

  for (var index = 0; index < 3; index += 1) {
    final reveal = find.text('نمایش پاسخ');
    await tester.ensureVisible(reveal);
    await tester.tap(reveal);
    await tester.pumpAndSettle();
    final remembered = find.text('بلد بودم');
    await tester.ensureVisible(remembered);
    await tester.tap(remembered);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 100));
  }

  expect(find.text('آفرین، مرور امروز تمام شد.'), findsOneWidget);
}

Future<void> _pumpApp(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  double textScaleFactor = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.textScaleFactorTestValue = textScaleFactor;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  final ids = ['vp-event-a', 'vp-event-b', 'vp-event-c'].iterator;
  final queue = ReviewQueue(
    store: ControlledReviewQueueStore(),
    idFactory: () {
      ids.moveNext();
      return ids.current;
    },
  );
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
