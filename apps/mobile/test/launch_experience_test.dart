import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/main.dart';

void main() {
  testWidgets('shows the approved launch screen before the Today shell',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const LearnBoxApp(splashDuration: Duration(seconds: 2)),
    );

    expect(find.bySemanticsLabel('صفحه آغاز LearnBox'), findsOneWidget);
    expect(find.text('LearnBox — امروز شما'), findsNothing);
  });

  testWidgets('moves from the launch screen to the Today shell',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const LearnBoxApp(splashDuration: Duration(milliseconds: 10)),
    );

    await tester.pump(const Duration(milliseconds: 10));

    expect(find.bySemanticsLabel('صفحه آغاز LearnBox'), findsNothing);
    expect(find.text('LearnBox — امروز شما'), findsOneWidget);
  });
}
