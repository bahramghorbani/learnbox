/// Typed outcome of one foreground synchronization attempt.
sealed class ReviewSyncResult {
  const ReviewSyncResult();

  /// The learner is signed out; no queue read or transport call occurred.
  const factory ReviewSyncResult.authenticationRequired() =
      AuthenticationRequired;

  /// The pending queue was empty; no transport call occurred.
  const factory ReviewSyncResult.nothingPending() = NothingPending;

  /// The attempt fully synchronized [acknowledgedCount] events.
  const factory ReviewSyncResult.synchronized({
    required int acknowledgedCount,
    required int remainingCount,
    String? cursor,
  }) = Synchronized;

  /// The attempt failed; [remainingCount] events were left pending.
  const factory ReviewSyncResult.retryableFailure({
    required int remainingCount,
  }) = RetryableFailure;
}

class AuthenticationRequired extends ReviewSyncResult {
  const AuthenticationRequired();
}

class NothingPending extends ReviewSyncResult {
  const NothingPending();
}

class Synchronized extends ReviewSyncResult {
  const Synchronized({
    required this.acknowledgedCount,
    required this.remainingCount,
    this.cursor,
  });

  final int acknowledgedCount;
  final int remainingCount;

  /// Persisted authoritative reconciliation cursor (ADR 0014); null when the
  /// transport did not report one.
  final String? cursor;
}

class RetryableFailure extends ReviewSyncResult {
  const RetryableFailure({required this.remainingCount});

  final int remainingCount;
}
