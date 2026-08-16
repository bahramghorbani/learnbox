import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/ui/learnbox_theme.dart';

void main() {
  test('uses the approved LearnBox visual tokens and Persian font family', () {
    final theme = buildLearnBoxTheme();

    expect(theme.scaffoldBackgroundColor, const Color(0xfffffaf4));
    expect(theme.colorScheme.primary, const Color(0xff4d6bfe));
    expect(theme.colorScheme.surface, Colors.white);
    expect(theme.textTheme.bodyLarge?.fontFamily, 'IRANSansX LearnBox');
    expect(theme.filledButtonTheme.style?.minimumSize?.resolve({}),
        const Size.fromHeight(56));
  });
}
