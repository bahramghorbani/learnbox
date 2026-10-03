import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/binary_review_ui_config.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/review_sync_coordinator.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

/// CP17 independent-review regression coverage.
///
/// Each test pins a defect the adversarial review found in the first CP17
/// candidate. These are behavioural: every one failed before its fix.
class _MemoryStore implements ReviewQueueStore {
  _MemoryStore([this._value]);
  String? _value;
  @override
  Future<String?> read() async => _value;
  @override
  Future<void> write(String serialized) async => _value = serialized;
}

class _RecordingTransport implements ReviewSyncTransport {
  _RecordingTransport(this._respond);
  final ReviewUploadResponse Function(List<PendingReviewEvent>) _respond;
  final batches = <List<PendingReviewEvent>>[];

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async {
    batches.add(List<PendingReviewEvent>.unmodifiable(events));
    return _respond(events);
  }
}

final _at = DateTime.utc(2026, 1, 1);

/// Deterministic client-event ids so a test can name the event it rejects.
ReviewEventIdFactory _ids(List<String> ids) {
  var i = 0;
  return () => ids[i++];
}

ReviewQueue _queueWithIds(List<String> ids) => ReviewQueue(
      store: _MemoryStore(),
      quarantineStore: _MemoryStore(),
      idFactory: _ids(ids),
    );

void main() {
  group('H3 — a terminally rejected event must leave the pending queue', () {
    test('salvaged event is retired to quarantine and stops being resent',
        () async {
      final queue = _queueWithIds(['bad', 'good']);
      await queue.record('card-bad', ReviewGrade.remembered, _at);
      await queue.record('card-good', ReviewGrade.remembered, _at);

      // Server salvages: 'bad' is terminally invalid, 'good' is accepted.
      final transport = _RecordingTransport(
        (events) => ReviewUploadResponse(
          acknowledgedClientEventIds: const ['good'],
          reconciliationCursor: '1',
          rejectedClientEventIds: const ['bad'],
        ),
      );
      final coordinator = ReviewSyncCoordinator(
        queue: queue,
        identityState: () => MobileIdentityState.authenticated,
        transport: transport,
      );

      await coordinator.synchronize();

      // Before the fix the rejected event stayed queued forever.
      expect(await queue.pendingCount(), 0);
      // ...and it is preserved as evidence rather than silently destroyed.
      expect(await queue.quarantinedEntries(), hasLength(1));
    });

    test('a server may not retire an event that was not in the batch',
        () async {
      final queue = _queueWithIds(['mine']);
      await queue.record('card-mine', ReviewGrade.remembered, _at);

      final transport = _RecordingTransport(
        (events) => ReviewUploadResponse(
          acknowledgedClientEventIds: const [],
          rejectedClientEventIds: const ['not-sent'],
        ),
      );
      final coordinator = ReviewSyncCoordinator(
        queue: queue,
        identityState: () => MobileIdentityState.authenticated,
        transport: transport,
      );

      await coordinator.synchronize();

      expect(await queue.pendingCount(), 1);
      expect(await queue.quarantinedEntries(), isEmpty);
    });
  });

  group('H2 — the kill switch must reach the UI gate', () {
    test('coordinator publishes the advertised switch', () async {
      final queue = _queueWithIds(['a']);
      await queue.record('card-a', ReviewGrade.remembered, _at);
      final notifier = BinaryReviewSwitch();

      final coordinator = ReviewSyncCoordinator(
        queue: queue,
        identityState: () => MobileIdentityState.authenticated,
        transport: _RecordingTransport(
          (events) => ReviewUploadResponse(
            acknowledgedClientEventIds: const ['a'],
            reconciliationCursor: '1',
            binaryReview: const BinaryReviewRuntimeConfig(
              creationEnabled: false,
              acceptanceEnabled: true,
            ),
          ),
        ),
        binaryReviewSwitch: notifier,
      );

      await coordinator.synchronize();

      expect(notifier.value.creationEnabled, isFalse);
      expect(notifier.value.acceptanceEnabled, isTrue);
    });

    test('switch is published even when nothing was acknowledged', () async {
      final queue = _queueWithIds(['a']);
      await queue.record('card-a', ReviewGrade.remembered, _at);
      final notifier = BinaryReviewSwitch();

      final coordinator = ReviewSyncCoordinator(
        queue: queue,
        identityState: () => MobileIdentityState.authenticated,
        transport: _RecordingTransport(
          (events) => ReviewUploadResponse(
            acknowledgedClientEventIds: const [],
            binaryReview: const BinaryReviewRuntimeConfig(
              creationEnabled: false,
              acceptanceEnabled: true,
            ),
          ),
        ),
        binaryReviewSwitch: notifier,
      );

      await coordinator.synchronize();

      // The kill moment is exactly when a batch stops being acknowledged.
      expect(notifier.value.creationEnabled, isFalse);
      // The queue is untouched: disabling creation never strands answers.
      expect(await queue.pendingCount(), 1);
    });

    test('a server cannot enable binary UI in a build that lacks it', () {
      const on = BinaryReviewRuntimeConfig(
        creationEnabled: true,
        acceptanceEnabled: true,
      );
      // Compile-time gate is off in the test binary, so the switch may not add it.
      expect(on.showsBinaryReview, isFalse);
    });
  });

  group('H4 — quarantine evidence must survive a restart', () {
    test('evidence persists through a fresh queue over the same stores',
        () async {
      final queueStore = _MemoryStore();
      final quarantineStore = _MemoryStore();

      final first = ReviewQueue(
        store: queueStore,
        quarantineStore: quarantineStore,
        idFactory: _ids(['doomed']),
      );
      await first.record('card-doomed', ReviewGrade.remembered, _at);
      await first.quarantineByClientEventId(const ['doomed']);
      expect(await first.quarantinedEntries(), hasLength(1));

      // Simulate process restart: new instances over the same durable stores.
      final second = ReviewQueue(
        store: queueStore,
        quarantineStore: quarantineStore,
      );
      expect(await second.quarantinedEntries(), hasLength(1));
      expect(await second.pendingCount(), 0);
    });
  });
}
