import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/identity/mobile_auth_config.dart';
import 'package:learnbox/features/review/bundled_start_pack_repository.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/secure_review_queue_store.dart';
import 'package:learnbox/features/sync/disabled_review_sync_transport.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/review_sync_coordinator.dart';

void main() {
  test('native auth and review sync remain disabled by default', () {
    const config = MobileAuthConfig.defaults();

    expect(config.authEnabled, isFalse);
    expect(config.reviewSyncEnabled, isFalse);
    expect(config.canComposeAuthenticatedReviewSync, isFalse);
    expect(config.productionIdentityState, MobileIdentityState.signedOut);
    expect(
      config.createProductionTransport(),
      isA<DisabledReviewSyncTransport>(),
    );
  });

  testWidgets('default app composition does not show native auth',
      (tester) async {
    await tester.pumpWidget(_app());
    await tester.pump(const Duration(seconds: 3));

    expect(find.text('به LearnBox خوش آمدی'), findsNothing);
    expect(find.text('امروز'), findsWidgets);
  });

  testWidgets('enabled composition can inject dormant auth after launch',
      (tester) async {
    await tester.pumpWidget(
      _app(
        authEnabled: true,
        authScreenBuilder: (_) => const Center(
          child: Text('سطح ورود آزمایشی'),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 3));

    expect(find.text('سطح ورود آزمایشی'), findsOneWidget);
    expect(find.text('امروز با سه کارت کوتاه شروع کنیم'), findsNothing);
  });
}

Widget _app({
  bool authEnabled = false,
  WidgetBuilder? authScreenBuilder,
}) {
  final repository = BundledStartPackRepository.fromJsonString('''
{"cards":[
{"id":"start-a1-haus","german":"das Haus","persian":"خانه","definition":"Ein Gebäude, in dem Menschen wohnen.","example":{"german":"Das Haus ist klein.","persian":"خانه کوچک است."},"imageAsset":"assets/cards/start-a1-haus.png"},
{"id":"start-a1-tisch","german":"der Tisch","persian":"میز","definition":"Ein Möbelstück mit einer flachen Fläche.","example":{"german":"Der Tisch ist groß.","persian":"میز بزرگ است."},"imageAsset":"assets/cards/start-a1-tisch.png"},
{"id":"start-a1-tuer","german":"die Tür","persian":"در","definition":"Man öffnet und schließt sie, um in einen Raum zu gehen.","example":{"german":"Die Tür ist offen.","persian":"در باز است."},"imageAsset":"assets/cards/start-a1-tuer.png"}
]}
''');
  final queue = ReviewQueue(store: SecureReviewQueueStore());
  return LearnBoxApp(
    startPackRepository: repository,
    reviewQueue: queue,
    splashDuration: Duration.zero,
    authEnabled: authEnabled,
    authScreenBuilder: authScreenBuilder,
    reviewSyncCoordinator: ReviewSyncCoordinator(
      queue: queue,
      identityState: () => MobileIdentityState.signedOut,
      transport: const DisabledReviewSyncTransport(),
    ),
  );
}
