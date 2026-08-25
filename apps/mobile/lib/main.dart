import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'features/identity/mobile_auth_config.dart';
import 'features/review/bundled_start_pack_repository.dart';
import 'features/review/review_queue.dart';
import 'features/review/secure_review_queue_store.dart';
import 'features/sync/review_sync_coordinator.dart';

export 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final startPackJson =
      await rootBundle.loadString('assets/content/start-a1-v1.json');
  final startPackRepository =
      BundledStartPackRepository.fromJsonString(startPackJson);
  final reviewQueue = ReviewQueue(store: SecureReviewQueueStore());
  const mobileAuthConfig = MobileAuthConfig.defaults();
  // Fail-closed production invariant: MobileIdentityState.signedOut plus
  // DisabledReviewSyncTransport() until a separately authorized activation.
  final reviewSyncCoordinator = ReviewSyncCoordinator(
    queue: reviewQueue,
    identityState: () => mobileAuthConfig.productionIdentityState,
    transport: mobileAuthConfig.createProductionTransport(),
  );

  runApp(
    LearnBoxApp(
      startPackRepository: startPackRepository,
      reviewQueue: reviewQueue,
      reviewSyncCoordinator: reviewSyncCoordinator,
    ),
  );
}
