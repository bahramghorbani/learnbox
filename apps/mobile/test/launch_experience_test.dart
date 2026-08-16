import 'package:flutter_test/flutter_test.dart';
import 'support/mobile_test_app.dart';

void main() {
  testWidgets('keeps the approved launch screen for three seconds',
      (WidgetTester tester) async {
    await tester.pumpWidget(buildMobileTestApp());

    expect(find.bySemanticsLabel('صفحه آغاز LearnBox'), findsOneWidget);
    expect(find.text('امروز'), findsNothing);

    await tester.pump(const Duration(milliseconds: 2999));
    expect(find.bySemanticsLabel('صفحه آغاز LearnBox'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump();
    expect(find.bySemanticsLabel('صفحه آغاز LearnBox'), findsNothing);
    // "امروز" appears as the heading and as the active bottom-navigation label.
    expect(find.text('امروز'), findsNWidgets(2));
  });

  testWidgets('moves from the launch screen to the Today shell',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      buildMobileTestApp(splashDuration: const Duration(milliseconds: 10)),
    );

    await tester.pump(const Duration(milliseconds: 10));
    await tester.pump();

    expect(find.bySemanticsLabel('صفحه آغاز LearnBox'), findsNothing);
    // "امروز" appears as the heading and as the active bottom-navigation label.
    expect(find.text('امروز'), findsNWidgets(2));
  });
}
