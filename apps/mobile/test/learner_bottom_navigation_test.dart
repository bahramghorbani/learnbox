import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/ui/learner_bottom_navigation.dart';

void main() {
  testWidgets('labels the learner navigation and returns selected destinations',
      (tester) async {
    LearnerDestination? selected;

    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            bottomNavigationBar: LearnerBottomNavigation(
              current: LearnerDestination.today,
              onDestinationSelected: (destination) => selected = destination,
            ),
          ),
        ),
      ),
    );

    expect(find.bySemanticsLabel('ناوبری اصلی'), findsOneWidget);
    expect(find.text('امروز'), findsOneWidget);
    expect(find.text('واژه‌ها'), findsOneWidget);
    expect(find.text('پیشرفت'), findsOneWidget);
    expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        0);

    await tester.tap(find.text('واژه‌ها'));

    expect(selected, LearnerDestination.words);
  });
}
