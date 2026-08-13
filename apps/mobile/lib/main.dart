import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

void main() => runApp(const LearnBoxApp());

class LearnBoxApp extends StatelessWidget {
  const LearnBoxApp({
    super.key,
    this.splashDuration = const Duration(seconds: 3),
  });

  final Duration splashDuration;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'LearnBox',
    debugShowCheckedModeBanner: false,
    locale: const Locale('fa'),
    supportedLocales: const [Locale('fa')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: LearnBoxLaunchScreen(splashDuration: splashDuration),
    ),
  );
}

class LearnBoxLaunchScreen extends StatefulWidget {
  const LearnBoxLaunchScreen({super.key, required this.splashDuration});

  final Duration splashDuration;

  @override
  State<LearnBoxLaunchScreen> createState() => _LearnBoxLaunchScreenState();
}

class _LearnBoxLaunchScreenState extends State<LearnBoxLaunchScreen> {
  var _showTodayShell = false;
  Timer? _splashTimer;

  @override
  void initState() {
    super.initState();
    _splashTimer = Timer(widget.splashDuration, () {
      if (mounted) {
        setState(() => _showTodayShell = true);
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
    if (_showTodayShell) {
      return const Scaffold(
        body: Center(child: Text('LearnBox — امروز شما')),
      );
    }

    return Scaffold(
      body: SizedBox.expand(
        child: Semantics(
          label: 'صفحه آغاز LearnBox',
          child: Image(
            image: AssetImage('assets/launch/germany-welcome-v1.jpg'),
            fit: BoxFit.cover,
            excludeFromSemantics: true,
          ),
        ),
      ),
    );
  }
}
