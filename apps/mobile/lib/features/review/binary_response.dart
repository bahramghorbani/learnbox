import 'review_grade.dart';

/// The learner's explicit binary answer: «بلد بودم» = known, «بلد نیستم» = unknown.
///
/// Mirrors `BINARY_RESPONSES` in `@learnbox/learning-engine`. Absence of a value
/// is meaningful: it marks a legacy four-grade event whose binary intent the
/// learner never actually expressed. Never synthesise one from a grade.
enum BinaryResponse {
  known,
  unknown;

  static BinaryResponse? fromSerialized(String value) {
    for (final response in values) {
      if (response.name == value) {
        return response;
      }
    }
    return null;
  }

  /// Compatibility shadow grade, mirroring `BINARY_SHADOW_GRADE` on the server
  /// (`known -> remembered`, `unknown -> forgot`). Stored alongside the explicit
  /// response so a rollback to a build that only understands four grades never
  /// encounters an invalid value.
  ReviewGrade get shadowGrade => switch (this) {
        BinaryResponse.known => ReviewGrade.remembered,
        BinaryResponse.unknown => ReviewGrade.forgot,
      };
}
