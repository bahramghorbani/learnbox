import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

/// Deliberately closed production transport until a separately reviewed
/// authenticated API boundary exists.
class DisabledReviewSyncTransport implements ReviewSyncTransport {
  const DisabledReviewSyncTransport();

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) =>
      throw StateError('Review synchronization transport is disabled.');
}
