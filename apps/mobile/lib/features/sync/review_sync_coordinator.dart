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
    ReviewReconciliationTransport? reconciliationTransport,
  })  : _queue = queue,
        _identityState = identityState,
        _transport = transport,
        _reconciliationCursorStore = reconciliationCursorStore,
        _reconciliationTransport = reconciliationTransport;

  final ReviewQueue _queue;
  final MobileIdentityState Function() _identityState;
  final ReviewSyncTransport _transport;
  final ReconciliationCursorStore? _reconciliationCursorStore;
  final ReviewReconciliationTransport? _reconciliationTransport;
  Future<ReviewSyncResult>? _inFlight;

  static const _batchSize = 20;

  /// Upper bound on reconciliation pages consumed by a single pass.
  ///
  /// A server that keeps reporting `hasMore` without ever terminating is a
  /// fault signal: the pass fails closed and persists nothing.
  static const maxReconciliationPages = 100;

  Future<ReviewSyncResult> synchronize() {
    return _inFlight ??= _synchronize().whenComplete(() => _inFlight = null);
  }

  Future<ReviewSyncResult> _synchronize() async {
    if (_identityState() == MobileIdentityState.signedOut) {
      return const ReviewSyncResult.authenticationRequired();
    }

    final pendingEvents = await _queue.pendingEvents();
    if (pendingEvents.isEmpty) {
      // Wire contract §7 step 4: with nothing left to POST, the reconnect
      // sequence closes the cursor gap instead.
      return reconcile();
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
      final remaining = await _queue.pendingCount();
      if (remaining == 0) {
        // Wire contract §7 step 4: once the POST queue is empty the same
        // attempt closes the cursor gap. The read never removes a queued
        // event, and a failed read leaves the stored cursor untouched, so the
        // POST acknowledgement is reported unchanged in that case.
        final reconciliation = await reconcile();
        if (reconciliation is Reconciled && reconciliation.cursor != null) {
          return Synchronized(
            acknowledgedCount: acknowledged.length,
            remainingCount: 0,
            cursor: reconciliation.cursor,
          );
        }
      }
      return Synchronized(
        acknowledgedCount: acknowledged.length,
        remainingCount: remaining,
        cursor: response.reconciliationCursor,
      );
    } catch (_) {
      return RetryableFailure(remainingCount: await _queue.pendingCount());
    }
  }

  /// Closes the reconciliation cursor gap with the read-only paged GET
  /// (wire contract §7 steps 4-5).
  ///
  /// This path never acknowledges and never removes a queued event: a GET
  /// result carries no queue authority, so only an exact POST acknowledgement
  /// may delete an event. A validated response advances the stored cursor to
  /// `nextCursor` only after every page of the pass validated; a malformed,
  /// partial, failed or unbounded response leaves both the queue and the
  /// previously stored cursor exactly as they were.
  Future<ReviewSyncResult> reconcile() async {
    if (_identityState() == MobileIdentityState.signedOut) {
      return const ReviewSyncResult.authenticationRequired();
    }

    final transport = _reconciliationTransport;
    final store = _reconciliationCursorStore;
    if (transport == null || store == null) {
      return const ReviewSyncResult.nothingPending();
    }

    String? after;
    try {
      // An unreadable or malformed persisted cursor fails closed before any
      // network call. Absence is the only state that starts from server zero.
      final storedCursor = await store.read();
      after = parseReconciliationCursor(storedCursor);
      if (storedCursor != null && after == null) {
        return _retryable();
      }
    } catch (_) {
      return _retryable();
    }

    for (var page = 0; page < maxReconciliationPages; page += 1) {
      final ReviewReconciliationPage response;
      try {
        response = await transport.readReconciliation(after: after);
      } catch (_) {
        return _retryable();
      }

      // Defence in depth: the transport already validates strictly, but the
      // page must also be internally coherent with what was requested.
      final echoed = parseReconciliationCursor(response.cursor);
      final nextCursor = parseReconciliationCursor(response.nextCursor);
      if (echoed == null ||
          nextCursor == null ||
          (after != null && echoed != after)) {
        return _retryable();
      }
      final delta = compareReconciliationCursors(nextCursor, echoed);
      // A page may only move forward, and must move while more remain.
      if (delta < 0 || (response.hasMore && delta == 0)) {
        return _retryable();
      }

      if (!response.hasMore) {
        try {
          await store.write(nextCursor);
        } catch (_) {
          return _retryable();
        }
        return Reconciled(
          remainingCount: await _queue.pendingCount(),
          cursor: nextCursor,
        );
      }
      after = nextCursor;
    }

    // Bounded paging exhausted without a final page: persist nothing.
    return _retryable();
  }

  Future<ReviewSyncResult> _retryable() async =>
      RetryableFailure(remainingCount: await _queue.pendingCount());
}
