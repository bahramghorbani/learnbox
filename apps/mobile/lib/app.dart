import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'features/review/review_queue.dart';
import 'features/review/start_pack_repository.dart';
import 'features/review/today_screen.dart';

class LearnBoxApp extends StatelessWidget {
  const LearnBoxApp({
    required this.startPackRepository,
    required this.reviewQueue,
    super.key,
    this.splashDuration = const Duration(seconds: 3),
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;
  final Duration splashDuration;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'LearnBox',
        debugShowCheckedModeBanner: false,
        locale: const Locale('fa'),
        supportedLocales: const [Locale('fa')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xff315d80),
            surface: const Color(0xfffffbf5),
          ),
          scaffoldBackgroundColor: const Color(0xfffffbf5),
          useMaterial3: true,
        ),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: LearnBoxLaunchScreen(
            startPackRepository: startPackRepository,
            reviewQueue: reviewQueue,
            splashDuration: splashDuration,
          ),
        ),
      );
}

class LearnBoxLaunchScreen extends StatefulWidget {
  const LearnBoxLaunchScreen({
    required this.startPackRepository,
    required this.reviewQueue,
    required this.splashDuration,
    super.key,
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;
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
      return TodayScreen(
        startPackRepository: widget.startPackRepository,
        reviewQueue: widget.reviewQueue,
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
