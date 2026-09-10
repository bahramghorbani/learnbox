import 'package:learnbox/features/review/pending_review_event.dart';

/// Provider-neutral upload port for pending review events.
///
/// The contract exposes no endpoint URL, header, cookie, token, provider or
/// server user identifier. Implementations durably acknowledge exact
/// [PendingReviewEvent.clientEventId] values only.
abstract interface class ReviewSyncTransport {
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  });
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

/// Provider-neutral, read-only port for the cursor-gap reconciliation read.
///
/// This port is deliberately separate from [ReviewSyncTransport]: the
/// reconciliation read is gap closing only. It never acknowledges and never
/// removes a locally queued review event, and no value it returns — including
/// `nextCursor` — ever authorizes queue removal. Only an exact acknowledgement
/// of an uploaded [PendingReviewEvent.clientEventId] may delete a queued event
/// (ADR 0014, `M1D_SYNC_WIRE_CONTRACT.md` §4).
abstract interface class ReviewReconciliationTransport {
  /// Reads one page of already-applied events strictly after [after].
  ///
  /// [after] is a non-negative decimal string, or null to read from the
  /// beginning of the learner's applied projection.
  ///
  /// An implementation must only return after fully and strictly validating
  /// the response. A non-200 status, a malformed or partial document, an
  /// invalid cursor or an out-of-range `nextCursor` must throw instead of
  /// returning so the caller can fail closed without persisting anything.
  Future<ReviewReconciliationPage> readReconciliation({String? after});
}

/// One strictly validated reconciliation page (ADR 0014).
class ReviewReconciliationPage {
  ReviewReconciliationPage({
    required this.cursor,
    required this.nextCursor,
    required this.hasMore,
    required List<ReviewReconciliationEvent> events,
  }) : events = List<ReviewReconciliationEvent>.unmodifiable(events);

  /// Server echo of the requested `after` value.
  final String cursor;

  /// Cursor to resume from; the only value this read may persist.
  final String nextCursor;

  /// Whether the server reported further applied events.
  final bool hasMore;

  /// Applied server events. Audit metadata only — never queue authority.
  final List<ReviewReconciliationEvent> events;
}

/// One applied server event reported by the reconciliation read.
class ReviewReconciliationEvent {
  const ReviewReconciliationEvent({
    required this.clientEventId,
    required this.eventId,
    required this.appliedAt,
  });

  final String clientEventId;
  final String eventId;

  /// Server application timestamp, kept as the raw validated string.
  final String appliedAt;
}
