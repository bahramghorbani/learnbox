import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'features/identity/mobile_auth_config.dart';
import 'features/identity/mobile_preview_auth_runtime.dart';
import 'features/review/binary_review_ui_config.dart';
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
  final reviewQueue = ReviewQueue(
    store: SecureReviewQueueStore(),
    // Review finding H4: without a durable store the F3 quarantine evidence is
    // memory-only and lost on restart, defeating the forensic recovery CP17 relies on.
    quarantineStore: SecureReviewQuarantineStore(),
  );
  // Review finding H2: one switch instance, written by sync, read by the UI gate.
  final binaryReviewSwitch = BinaryReviewSwitch();
  const mobileAuthConfig = MobileAuthConfig.defaults();
  final previewRuntime = MobilePreviewAuthRuntime.fromCompileTime(
    approvedOrigin: const String.fromEnvironment(
      'LEARNBOX_MOBILE_APPROVED_PREVIEW_ORIGIN',
    ),
  );
  final WidgetBuilder? authScreenBuilder;
  if (previewRuntime == null) {
    authScreenBuilder = null;
  } else {
    final authScreen = await previewRuntime.createAuthScreen();
    authScreenBuilder = (_) => authScreen;
  }
  // Fail-closed production invariant: MobileIdentityState.signedOut plus
  // DisabledReviewSyncTransport() until a separately authorized activation.
  final reviewSyncCoordinator = ReviewSyncCoordinator(
    queue: reviewQueue,
    identityState: () => mobileAuthConfig.productionIdentityState,
    transport: mobileAuthConfig.createProductionTransport(),
    binaryReviewSwitch: binaryReviewSwitch,
  );

  runApp(
    LearnBoxApp(
      startPackRepository: startPackRepository,
      reviewQueue: reviewQueue,
      reviewSyncCoordinator: reviewSyncCoordinator,
      binaryReviewSwitch: binaryReviewSwitch,
      authEnabled: authScreenBuilder != null,
      authScreenBuilder: authScreenBuilder,
    ),
  );
}
