import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
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
  })  : _queue = queue,
        _identityState = identityState,
        _transport = transport;

  final ReviewQueue _queue;
  final MobileIdentityState Function() _identityState;
  final ReviewSyncTransport _transport;
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
      final response = await _transport.upload(batch);
      final acknowledged = validateAcknowledgements(batch, response);
      if (acknowledged.isEmpty) {
        return RetryableFailure(remainingCount: pendingEvents.length);
      }

      await _queue.acknowledge(acknowledged);
      return Synchronized(
        acknowledgedCount: acknowledged.length,
        remainingCount: await _queue.pendingCount(),
      );
    } catch (_) {
      return RetryableFailure(remainingCount: await _queue.pendingCount());
    }
  }
}
