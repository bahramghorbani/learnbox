import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/reconciliation_cursor_store.dart';
import 'package:learnbox/features/sync/review_acknowledgement.dart';
import 'package:learnbox/features/sync/review_sync_result.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

/// Coordinates only a user-initiated foreground review synchronization.
///
/// Production composition currently supplies a signed-out identity state and a
/// disabled transport, so this class has no active network path.
class ReviewSyncCoordinator {
  ReviewSyncCoordinator({
    required ReviewQueue queue,
    required MobileIdentityState Function() identityState,
    required ReviewSyncTransport transport,
    ReconciliationCursorStore? reconciliationCursorStore,
  })  : _queue = queue,
        _identityState = identityState,
        _transport = transport,
        _reconciliationCursorStore = reconciliationCursorStore;

  final ReviewQueue _queue;
  final MobileIdentityState Function() _identityState;
  final ReviewSyncTransport _transport;
  final ReconciliationCursorStore? _reconciliationCursorStore;
  Future<ReviewSyncResult>? _inFlight;

  static const _batchSize = 20;

  Future<ReviewSyncResult> synchronize() {
    return _inFlight ??= _synchronize().whenComplete(() => _inFlight = null);
  }

  Future<ReviewSyncResult> _synchronize() async {
    if (_identityState() == MobileIdentityState.signedOut) {
      return const ReviewSyncResult.authenticationRequired();
    }

    final pendingEvents = await _queue.pendingEvents();
    if (pendingEvents.isEmpty) {
      return const ReviewSyncResult.nothingPending();
    }

    final batch = pendingEvents.take(_batchSize).toList(growable: false);
    try {
      // ADR 0014: read the stored cursor before uploading so the next slice
      // can send it with the request. The read fails closed: an invalid stored
      // cursor is treated as absent, and a read failure is retryable with no
      // transport or queue mutation.
      final cursorStore = _reconciliationCursorStore;
      String? storedCursor;
      if (cursorStore != null) {
        storedCursor = await cursorStore.read();
        parseReconciliationCursor(storedCursor);
      }
      final response = await _transport.upload(
        batch,
        reconciliationCursor: storedCursor,
      );
      final acknowledged = validateAcknowledgements(batch, response);
      if (acknowledged.isEmpty) {
        return RetryableFailure(remainingCount: pendingEvents.length);
      }

      // ADR 0014: queue acknowledgement and cursor persistence both come only
      // after exact acknowledgement validation. The cursor is persisted after
      // the queue acknowledgement; a cursor write failure is retryable and
      // never reports Synchronized, so no acknowledged event is lost.
      await _queue.acknowledge(acknowledged);
      final store = _reconciliationCursorStore;
      if (store != null && response.reconciliationCursor != null) {
        await store.write(response.reconciliationCursor!);
      }
      return Synchronized(
        acknowledgedCount: acknowledged.length,
        remainingCount: await _queue.pendingCount(),
        cursor: response.reconciliationCursor,
      );
    } catch (_) {
      return RetryableFailure(remainingCount: await _queue.pendingCount());
    }
  }
}
