import 'package:flutter/material.dart';

import 'learnbox_theme.dart';

enum LearnerDestination { today, words, progress }

class LearnerBottomNavigation extends StatelessWidget {
  const LearnerBottomNavigation({
    required this.current,
    required this.onDestinationSelected,
    super.key,
  });

  final LearnerDestination current;
  final ValueChanged<LearnerDestination> onDestinationSelected;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'ناوبری اصلی',
        container: true,
        child: NavigationBar(
          selectedIndex: current.index,
          height: 72,
          backgroundColor: Colors.white,
          indicatorColor: learnBoxLavender,
          onDestinationSelected: (index) =>
              onDestinationSelected(LearnerDestination.values[index]),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.today_outlined),
              selectedIcon: Icon(Icons.today),
              label: 'امروز',
            ),
            NavigationDestination(
              icon: Icon(Icons.style_outlined),
              selectedIcon: Icon(Icons.style),
              label: 'واژه‌ها',
            ),
            NavigationDestination(
              icon: Icon(Icons.insights_outlined),
              selectedIcon: Icon(Icons.insights),
              label: 'پیشرفت',
            ),
          ],
        ),
      );
}
