/// Dormant native learner session credentials.
///
/// This value object is intentionally not composed into the app yet. Tokens are
/// opaque to the client and are never logged or serialized outside the store.
class MobileSession {
  const MobileSession({
    required this.accessToken,
    required this.refreshToken,
    required this.sessionId,
  });

  final String accessToken;
  final String refreshToken;
  final String sessionId;
}
