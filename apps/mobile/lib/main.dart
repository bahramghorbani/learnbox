import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

void main() => runApp(const LearnBoxApp());

class LearnBoxApp extends StatelessWidget {
  const LearnBoxApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'LearnBox',
    debugShowCheckedModeBanner: false,
    locale: const Locale('fa'),
    supportedLocales: const [Locale('fa')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: const Directionality(textDirection: TextDirection.rtl, child: Scaffold(body: Center(child: Text('LearnBox — امروز شما')))),
  );
}
