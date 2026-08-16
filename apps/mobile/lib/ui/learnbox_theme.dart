import 'package:flutter/material.dart';

const learnBoxCanvas = Color(0xfffffaf4);
const learnBoxPrimary = Color(0xff4d6bfe);
const learnBoxLavender = Color(0xfff3ecff);
const learnBoxBorder = Color(0xffe7e3ff);
const learnBoxInk = Color(0xff1e293b);
const learnBoxMuted = Color(0xff64748b);
const learnBoxApricot = Color(0xffffb36b);
const learnBoxFontFamily = 'IRANSansX LearnBox';

ThemeData buildLearnBoxTheme() {
  const colorScheme = ColorScheme.light(
    primary: learnBoxPrimary,
    onPrimary: Colors.white,
    surface: Colors.white,
    onSurface: learnBoxInk,
    error: Color(0xffb3261e),
  );
  final textTheme = ThemeData.light().textTheme.apply(
        fontFamily: learnBoxFontFamily,
        bodyColor: learnBoxInk,
        displayColor: learnBoxInk,
      );

  return ThemeData(
    useMaterial3: true,
    fontFamily: learnBoxFontFamily,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: learnBoxCanvas,
    textTheme: textTheme,
    cardTheme: const CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
        side: BorderSide(color: learnBoxBorder),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size.fromHeight(56)),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        ),
        shape: const WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(18)),
          ),
        ),
        textStyle: WidgetStatePropertyAll(
          textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    ),
  );
}

TextStyle learnBoxGermanStyle(BuildContext context) => Theme.of(context)
    .textTheme
    .bodyLarge!
    .copyWith(fontFamily: learnBoxFontFamily, fontWeight: FontWeight.w700);
