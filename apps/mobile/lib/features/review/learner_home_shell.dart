import 'package:flutter/material.dart';

import '../../ui/learner_bottom_navigation.dart';
import 'binary_review_ui_config.dart';
import 'personal_vocabulary_store.dart';
import 'profile_screen.dart';
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
    this.personalVocabularyStore,
    this.binaryReviewSwitch,
    super.key,
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;
  final PronunciationPlayer pronunciationPlayer;
  final PersonalVocabularyStore? personalVocabularyStore;

  /// Runtime binary-review switch published by sync (CP17 F2 / review H2).
  final BinaryReviewSwitch? binaryReviewSwitch;

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
              binaryReviewSwitch: widget.binaryReviewSwitch,
            ),
          LearnerDestination.words => WordsScreen(
              startPackRepository: widget.startPackRepository,
              personalVocabularyStore: widget.personalVocabularyStore,
            ),
          LearnerDestination.progress => ProgressScreen(
              reviewQueue: widget.reviewQueue,
              onStartReview: () =>
                  setState(() => _destination = LearnerDestination.today),
            ),
          LearnerDestination.profile => ProfileScreen(
              reviewQueue: widget.reviewQueue,
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
