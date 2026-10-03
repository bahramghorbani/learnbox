/// Build-time gate for the native binary review interaction (CP16 / Decision A).
///
/// Mirrors Web's `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI`. Default **off**: a build
/// that does not pass the define keeps the historical four-grade interaction, so
/// the migration is independently deployable and reversible by rebuild.
///
/// This gate controls the learner-facing interaction **only**. It does not enable
/// Scheduler V2 and has no relationship to `LEARNBOX_SCHEDULER_V2`, which stays
/// absent; the server decides scheduling independently of which buttons shipped.
class BinaryReviewUiConfig {
  const BinaryReviewUiConfig._();

  static const _define =
      String.fromEnvironment('LEARNBOX_MOBILE_BINARY_REVIEW_UI');

  /// True only for an exact `true`, so a typo fails safe to four grades.
  static bool get enabled => _define == 'true';
}
