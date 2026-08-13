import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/sync/disabled_review_sync_transport.dart';

void main() {
  test('disabled transport fails before any delivery can occur', () async {
    const transport = DisabledReviewSyncTransport();

    expect(() => transport.upload(const []), throwsStateError);
  });

  test('production composition stays signed out with disabled transport',
      () async {
    final source = await File('lib/main.dart').readAsString();

    expect(source, contains('MobileIdentityState.signedOut'));
    expect(source, contains('DisabledReviewSyncTransport()'));
    expect(source, contains('ReviewSyncCoordinator('));
    expect(source, isNot(contains('http')));
    expect(source, isNot(contains('Timer(')));
  });
}
