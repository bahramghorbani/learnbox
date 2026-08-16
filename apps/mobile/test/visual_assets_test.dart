import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('bundles approved LearnBox fonts and canonical Bobo assets', () async {
    for (final path in const [
      'assets/fonts/IRANSansX-Regular.woff2',
      'assets/fonts/IRANSansX-Bold.woff2',
      'assets/bobo/encourage-v2.png',
      'assets/bobo/celebrate-v2.png',
    ]) {
      final asset = await rootBundle.load(path);
      expect(asset.lengthInBytes, greaterThan(0), reason: '$path is present');
    }
  });
}
