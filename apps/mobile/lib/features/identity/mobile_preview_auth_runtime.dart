import 'package:flutter/material.dart';

import 'mobile_auth_client.dart';
import 'mobile_auth_http_client.dart';
import 'mobile_auth_http_transport.dart';
import 'mobile_auth_screen.dart';
import 'mobile_installation_id_store.dart';
import 'mobile_preview_auth_config.dart';
import 'mobile_session_store.dart';
import 'secure_mobile_session_store.dart';

/// Build-time-only gate for the owner-controlled native Preview auth run.
class MobilePreviewAuthRuntime {
  MobilePreviewAuthRuntime._(this.origin);

  static MobilePreviewAuthRuntime? fromCompileTime({
    required String approvedOrigin,
  }) {
    return fromValues(
      origin: const String.fromEnvironment('LEARNBOX_MOBILE_PREVIEW_ORIGIN'),
      verifyEnabled: const String.fromEnvironment(
        'LEARNBOX_MOBILE_PREVIEW_VERIFY_ENABLED',
      ),
      approvedOrigin: approvedOrigin,
    );
  }

  static MobilePreviewAuthRuntime? fromValues({
    required String origin,
    required String verifyEnabled,
    required String approvedOrigin,
  }) {
    final config = MobilePreviewAuthConfig.fromValues(
      origin: origin,
      verifyEnabled: verifyEnabled,
      approvedOrigin: approvedOrigin,
    );
    final uri = config.origin;
    if (!config.enabled || uri == null) return null;
    return MobilePreviewAuthRuntime._(uri);
  }

  final Uri origin;

  Future<Widget> createAuthScreen({
    MobileInstallationSecretStore? installationSecrets,
    MobileAuthHttpTransport? transport,
    MobileSessionStore? sessionStore,
  }) async {
    final secrets =
        installationSecrets ?? FlutterMobileInstallationSecretStore();
    final installationId =
        await MobileInstallationIdStore(secrets: secrets).readOrCreate();
    return MobileAuthScreen(
      authClient: MobileAuthClient(
        origin: origin,
        http: transport ?? DartIoMobileAuthHttpTransport(),
        store: sessionStore ?? SecureMobileSessionStore(),
      ),
      installationId: installationId,
    );
  }
}
