import 'package:learnbox/features/sync/disabled_review_sync_transport.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

/// Compile-time defaults for dormant native auth and review transport.
///
/// This slice intentionally exposes no environment reader or endpoint. Production
/// remains signed out with review transport disabled until a separately approved
/// activation slice provides both.
class MobileAuthConfig {
  const MobileAuthConfig({
    required this.authEnabled,
    required this.reviewSyncEnabled,
  });

  const MobileAuthConfig.defaults()
      : authEnabled = false,
        reviewSyncEnabled = false;

  final bool authEnabled;
  final bool reviewSyncEnabled;

  bool get canComposeAuthenticatedReviewSync =>
      authEnabled && reviewSyncEnabled;

  MobileIdentityState get productionIdentityState =>
      MobileIdentityState.signedOut;

  ReviewSyncTransport createProductionTransport() =>
      const DisabledReviewSyncTransport();
}
