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

  /// The read-only reconciliation pass closed the cursor gap.
  ///
  /// This variant never reports acknowledged events: the reconciliation read
  /// has no authority to remove a queued event. Only a validated POST
  /// acknowledgement produces [Synchronized].
  const factory ReviewSyncResult.reconciled({
    required int remainingCount,
    String? cursor,
  }) = Reconciled;

  /// The server deterministically refused the batch (LB-B35 CP10 / D16).
  ///
  /// Distinct from [RetryableFailure]: the request was well-formed but the
  /// scheduler refuses it identically every time, so an automatic retry can
  /// never succeed. [remainingCount] events stay queued, so no learner answer
  /// is discarded and the application can surface or resolve the terminal
  /// condition without losing work.
  const factory ReviewSyncResult.schedulerRejected({
    required int remainingCount,
  }) = SchedulerRejected;
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

class Reconciled extends ReviewSyncResult {
  const Reconciled({required this.remainingCount, this.cursor});

  /// Events still pending locally; the reconciliation read never changes this.
  final int remainingCount;

  /// Validated `nextCursor` persisted for the read (ADR 0014); null when the
  /// read did not persist one.
  final String? cursor;
}

/// Terminal, non-retryable deterministic refusal by the server scheduler.
///
/// The queued events are intentionally retained: a deterministic refusal is a
/// reason to stop retrying automatically, never a reason to drop a learner's
/// unsynced answer.
class SchedulerRejected extends ReviewSyncResult {
  const SchedulerRejected({required this.remainingCount});

  /// Events still pending locally; a deterministic refusal removes none.
  final int remainingCount;
}
