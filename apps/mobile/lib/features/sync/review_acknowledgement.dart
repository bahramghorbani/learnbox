import 'package:learnbox/features/review/pending_review_event.dart';

/// Validates a transport acknowledgement against the batch that was uploaded.
///
/// Returns an unmodifiable list of exactly the acknowledged client event IDs.
/// Throws [InvalidReviewAcknowledgement] when the response is not internally
/// valid, in which case nothing may be acknowledged.
List<String> validateAcknowledgements(
  List<PendingReviewEvent> batch,
  List<String> responseIds,
) {
  final batchIds = batch.map((event) => event.clientEventId).toSet();

  final seen = <String>{};
  for (final id in responseIds) {
    if (!batchIds.contains(id) || !seen.add(id)) {
      throw InvalidReviewAcknowledgement(
        'Acknowledgement is not a valid subset of the uploaded batch.',
      );
    }
  }

  return List<String>.unmodifiable(responseIds);
}

/// Thrown when a transport acknowledgement is not internally valid.
class InvalidReviewAcknowledgement implements Exception {
  const InvalidReviewAcknowledgement(this.message);

  final String message;

  @override
  String toString() => 'InvalidReviewAcknowledgement: $message';
}
