import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'features/review/learner_home_shell.dart';
import 'features/review/pronunciation_player.dart';
import 'features/review/review_queue.dart';
import 'features/review/start_pack_repository.dart';
import 'features/sync/review_sync_coordinator.dart';
import 'ui/learnbox_theme.dart';

class LearnBoxApp extends StatelessWidget {
  const LearnBoxApp({
    required this.startPackRepository,
    required this.reviewQueue,
    this.pronunciationPlayer = const MethodChannelPronunciationPlayer(),
    this.reviewSyncCoordinator,
    this.authEnabled = false,
    this.authScreenBuilder,
    super.key,
    this.splashDuration = const Duration(seconds: 3),
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;
  final PronunciationPlayer pronunciationPlayer;

  final ReviewSyncCoordinator? reviewSyncCoordinator;
  final bool authEnabled;
  final WidgetBuilder? authScreenBuilder;
  final Duration splashDuration;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'LearnBox',
        debugShowCheckedModeBanner: false,
        locale: const Locale('fa'),
        supportedLocales: const [Locale('fa')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: buildLearnBoxTheme(),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: LearnBoxLaunchScreen(
            startPackRepository: startPackRepository,
            reviewQueue: reviewQueue,
            pronunciationPlayer: pronunciationPlayer,
            authEnabled: authEnabled,
            authScreenBuilder: authScreenBuilder,
            splashDuration: splashDuration,
          ),
        ),
      );
}

class LearnBoxLaunchScreen extends StatefulWidget {
  const LearnBoxLaunchScreen({
    required this.startPackRepository,
    required this.reviewQueue,
    required this.pronunciationPlayer,
    this.authEnabled = false,
    this.authScreenBuilder,
    required this.splashDuration,
    super.key,
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;
  final PronunciationPlayer pronunciationPlayer;
  final bool authEnabled;
  final WidgetBuilder? authScreenBuilder;
  final Duration splashDuration;

  @override
  State<LearnBoxLaunchScreen> createState() => _LearnBoxLaunchScreenState();
}

class _LearnBoxLaunchScreenState extends State<LearnBoxLaunchScreen> {
  var _showToday = false;
  Timer? _splashTimer;

  @override
  void initState() {
    super.initState();
    _splashTimer = Timer(widget.splashDuration, () {
      if (mounted) {
        setState(() => _showToday = true);
      }
    });
  }

  @override
  void dispose() {
    _splashTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_showToday) {
      if (widget.authEnabled && widget.authScreenBuilder != null) {
        return widget.authScreenBuilder!(context);
      }
      return LearnerHomeShell(
        startPackRepository: widget.startPackRepository,
        reviewQueue: widget.reviewQueue,
        pronunciationPlayer: widget.pronunciationPlayer,
      );
    }

    return Scaffold(
      body: SizedBox.expand(
        child: Semantics(
          label: 'صفحه آغاز LearnBox',
          child: const Image(
            image: AssetImage('assets/launch/germany-welcome-v1.jpg'),
            fit: BoxFit.cover,
            excludeFromSemantics: true,
          ),
        ),
      ),
    );
  }
}
