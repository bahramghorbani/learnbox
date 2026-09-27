import 'package:flutter_test/flutter_test.dart';

import 'support/mobile_test_app.dart';

void main() {
  testWidgets('renders the native host with the LearnBox shell',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      buildMobileTestApp(splashDuration: const Duration(milliseconds: 1)),
    );
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump();
    // "امروز" appears as the heading and as the active bottom-navigation label.
    expect(find.text('امروز'), findsNWidgets(2));
  });
}
