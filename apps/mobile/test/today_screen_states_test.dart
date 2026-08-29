import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/start_card.dart';
import 'package:learnbox/features/review/start_pack_repository.dart';

import 'mobile_learning_loop_test.dart'
    show ControlledReviewQueueStore, InMemoryStartPackRepository;

void main() {
  testWidgets('Today loading state labels the offline session assembly',
      (tester) async {
    final gated = _GatedStartPackRepository();
    await _pumpApp(tester, startPackRepository: gated, settle: false);
    await tester.pump(const Duration(milliseconds: 1));

    expect(
      find.bySemanticsLabel('در حال آماده‌کردن مرور امروز'),
      findsOneWidget,
    );
    expect(find.textContaining('آفلاین'), findsNothing);

    gated.gate.complete(await InMemoryStartPackRepository().loadDailySession());
    await tester.pumpAndSettle();
    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today empty state invites the next useful action',
      (tester) async {
    await _pumpApp(tester, startPackRepository: _EmptyStartPackRepository());

    expect(find.text('امروز کارتی برای مرور آماده نیست.'), findsOneWidget);
    expect(find.text('شروع مرور'), findsNothing);
    expect(find.text('تلاش دوباره'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today labels its card count as device-local truth',
      (tester) async {
    await _pumpApp(tester);

    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
    expect(
      find.text('این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و هنوز به '
          'سرور وصل نشده است.'),
      findsOneWidget,
    );
    expect(find.textContaining('سرور'), findsOneWidget);
    expect(find.textContaining('آفلاین'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today shows the pending-sync chip only for real local events',
      (tester) async {
    final store = ControlledReviewQueueStore();
    store.value = _serializedQueueWith(2);
    await _pumpApp(
      tester,
      reviewQueue: ReviewQueue(store: store, idFactory: () => 'm1c-event-a'),
    );

    expect(find.text('۲ رویداد در انتظار همگام‌سازی'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today shows no pending chip when the local queue is empty',
      (tester) async {
    await _pumpApp(tester);

    expect(find.textContaining('در انتظار همگام'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today queue read failure fails closed without a pending chip',
      (tester) async {
    final store = _FailingReviewQueueStore();
    await _pumpApp(tester, reviewQueue: ReviewQueue(store: store));

    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
    expect(find.textContaining('در انتظار همگام'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today reports a pending count of one in Persian digits',
      (tester) async {
    final store = ControlledReviewQueueStore();
    store.value = _serializedQueueWith(1);
    await _pumpApp(
      tester,
      reviewQueue: ReviewQueue(store: store, idFactory: () => 'm1c-event-a'),
    );

    expect(find.text('۱ رویداد در انتظار همگام‌سازی'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today pending chip survives navigation and review completion',
      (tester) async {
    final store = ControlledReviewQueueStore();
    store.value = _serializedQueueWith(1);
    final queue = ReviewQueue(store: store, idFactory: () => 'm1c-event-a');
    await _pumpApp(tester, reviewQueue: queue);

    expect(find.text('۱ رویداد در انتظار همگام‌سازی'), findsOneWidget);

    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();
    expect(find.text('واژه‌های شروع'), findsOneWidget);
    await tester.tap(find.text('امروز'));
    await tester.pumpAndSettle();
    expect(find.text('۱ رویداد در انتظار همگام‌سازی'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

String _serializedQueueWith(int count) {
  final events = [
    for (var index = 0; index < count; index += 1)
      '{"clientEventId":"m1c-event-$index","cardId":"start-a1-haus",'
          '"grade":"remembered","occurredAt":"2026-08-13T09:00:00.000Z"}',
  ].join(',');
  return '{"schemaVersion":1,"events":[$events]}';
}

Future<void> _pumpApp(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  double textScaleFactor = 1,
  StartPackRepository? startPackRepository,
  ReviewQueue? reviewQueue,
  bool settle = true,
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
      startPackRepository: startPackRepository ?? InMemoryStartPackRepository(),
      reviewQueue: reviewQueue ??
          ReviewQueue(store: ControlledReviewQueueStore()),
      splashDuration: Duration.zero,
    ),
  );
  if (settle) {
    await tester.pumpAndSettle();
  }
}

class _GatedStartPackRepository implements StartPackRepository {
  final Completer<List<StartCard>> gate = Completer<List<StartCard>>();

  @override
  Future<List<StartCard>> loadDailySession() => gate.future;
}

class _EmptyStartPackRepository implements StartPackRepository {
  @override
  Future<List<StartCard>> loadDailySession() async => const [];
}

class _FailingReviewQueueStore implements ReviewQueueStore {
  @override
  Future<String?> read() async => throw StateError('synthetic queue failure');

  @override
  Future<void> write(String serializedEvents) async {}
}