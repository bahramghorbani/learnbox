import 'package:flutter_test/flutter_test.dart';

import 'package:learnbox/main.dart';

void main() {
  testWidgets('renders the native host with the LearnBox shell',
      (WidgetTester tester) async {
    await tester.pumpWidget(const LearnBoxApp());
    expect(find.text('LearnBox — امروز شما'), findsOneWidget);
  });
}
