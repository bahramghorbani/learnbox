import 'package:flutter_test/flutter_test.dart';

import 'support/mobile_test_app.dart';

void main() {
  testWidgets('renders the Persian Today shell', (tester) async {
    await tester.pumpWidget(
      buildMobileTestApp(splashDuration: const Duration(milliseconds: 1)),
    );
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump();
    expect(find.text('امروز'), findsOneWidget);
    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
  });
}
