import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/main.dart';

void main() {
  testWidgets('renders the Persian Today shell', (tester) async {
    await tester.pumpWidget(const LearnBoxApp());
    expect(find.text('LearnBox — امروز شما'), findsOneWidget);
  });
}
