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

  testWidgets('exposes Profile as the fourth persistent destination',
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

    final navigationBar =
        tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(navigationBar.destinations, hasLength(4));
    expect(
      navigationBar.destinations
          .cast<NavigationDestination>()
          .map((destination) => destination.label)
          .toList(),
      ['امروز', 'واژه‌ها', 'پیشرفت', 'پروفایل'],
    );
    expect(find.text('پروفایل'), findsOneWidget);

    await tester.tap(find.text('پروفایل'));

    expect(selected, LearnerDestination.profile);
  });
}
