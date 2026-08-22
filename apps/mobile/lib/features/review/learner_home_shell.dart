import 'package:flutter/material.dart';

import '../../ui/learner_bottom_navigation.dart';
import 'pronunciation_player.dart';
import 'progress_screen.dart';
import 'review_queue.dart';
import 'start_pack_repository.dart';
import 'today_screen.dart';
import 'words_screen.dart';

class LearnerHomeShell extends StatefulWidget {
  const LearnerHomeShell({
    required this.startPackRepository,
    required this.reviewQueue,
    required this.pronunciationPlayer,
    super.key,
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;
  final PronunciationPlayer pronunciationPlayer;

  @override
  State<LearnerHomeShell> createState() => _LearnerHomeShellState();
}

class _LearnerHomeShellState extends State<LearnerHomeShell> {
  var _destination = LearnerDestination.today;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: switch (_destination) {
          LearnerDestination.today => TodayScreen(
              startPackRepository: widget.startPackRepository,
              reviewQueue: widget.reviewQueue,
              pronunciationPlayer: widget.pronunciationPlayer,
            ),
          LearnerDestination.words => WordsScreen(
              startPackRepository: widget.startPackRepository,
            ),
          LearnerDestination.progress => ProgressScreen(
              reviewQueue: widget.reviewQueue,
              onStartReview: () =>
                  setState(() => _destination = LearnerDestination.today),
            ),
        },
        bottomNavigationBar: SafeArea(
          top: false,
          child: LearnerBottomNavigation(
            current: _destination,
            onDestinationSelected: (destination) {
              setState(() => _destination = destination);
            },
          ),
        ),
      );
}
