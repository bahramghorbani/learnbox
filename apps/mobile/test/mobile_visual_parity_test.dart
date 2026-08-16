import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/mobile_test_app.dart';

void main() {
  testWidgets('Today shows title, count and primary action in a readable layout',
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

  await tester.pumpWidget(
    buildMobileTestApp(splashDuration: Duration.zero),
  );
  await tester.pumpAndSettle();
}
