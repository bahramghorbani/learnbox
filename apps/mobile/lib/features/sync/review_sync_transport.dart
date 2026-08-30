import 'package:learnbox/features/review/pending_review_event.dart';

/// Provider-neutral upload port for pending review events.
///
/// The contract exposes no endpoint URL, header, cookie, token, provider or
/// server user identifier. Implementations durably acknowledge exact
/// [PendingReviewEvent.clientEventId] values only.
abstract interface class ReviewSyncTransport {
  Future<ReviewUploadResponse> upload(List<PendingReviewEvent> events);
}

/// Immutable acknowledgement returned by [ReviewSyncTransport.upload].
class ReviewUploadResponse {
  ReviewUploadResponse({
    required List<String> acknowledgedClientEventIds,
    this.reconciliationCursor,
  }) : acknowledgedClientEventIds =
            List<String>.unmodifiable(acknowledgedClientEventIds);

  final List<String> acknowledgedClientEventIds;

  /// Authoritative per-learner projection version after the batch (ADR 0014),
  /// as a non-negative decimal string; null when no outcome was acknowledged.
  final String? reconciliationCursor;
}
