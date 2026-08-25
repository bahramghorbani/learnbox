import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_auth_config.dart';
import 'package:learnbox/features/sync/disabled_review_sync_transport.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';

void main() {
  test('native auth and review sync remain disabled by default', () {
    const config = MobileAuthConfig.defaults();

    expect(config.authEnabled, isFalse);
    expect(config.reviewSyncEnabled, isFalse);
    expect(config.canComposeAuthenticatedReviewSync, isFalse);
    expect(config.productionIdentityState, MobileIdentityState.signedOut);
    expect(
        config.createProductionTransport(), isA<DisabledReviewSyncTransport>());
  });
}
