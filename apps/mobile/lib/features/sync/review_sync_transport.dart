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
  ReviewUploadResponse({required List<String> acknowledgedClientEventIds})
      : acknowledgedClientEventIds =
            List<String>.unmodifiable(acknowledgedClientEventIds);

  final List<String> acknowledgedClientEventIds;
}
