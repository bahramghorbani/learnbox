import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/review_acknowledgement.dart';
import 'package:learnbox/features/sync/review_sync_result.dart'
    show
        AuthenticationRequired,
        NothingPending,
        ReviewSyncResult,
        RetryableFailure,
        Synchronized;
import 'package:learnbox/features/sync/review_sync_transport.dart';

PendingReviewEvent _event(String id) => PendingReviewEvent(
      clientEventId: id,
      cardId: 'start-a1-haus',
      grade: ReviewGrade.remembered,
      occurredAt: DateTime.utc(2026, 8, 13, 9),
    );

void main() {
  group('MobileIdentityState', () {
    test('exposes signedOut and authenticated', () {
      expect(MobileIdentityState.values, [
        MobileIdentityState.signedOut,
        MobileIdentityState.authenticated,
      ]);
    });
  });

  group('ReviewSyncTransport', () {
    test('upload returns the exact acknowledged clientEventIds', () async {
      final transport = _EchoTransport();
      final response = await transport.upload([_event('a'), _event('b')]);
      expect(response.acknowledgedClientEventIds, ['a', 'b']);
    });
  });

  group('ReviewUploadResponse', () {
    test('is immutable', () {
      final response = ReviewUploadResponse(
        acknowledgedClientEventIds: ['a', 'b'],
      );
      expect(
        () => response.acknowledgedClientEventIds.add('c'),
        throwsUnsupportedError,
      );
    });
  });

  group('validateAcknowledgements', () {
    final batch = [_event('a'), _event('b'), _event('c')];
    final batchIds = batch.map((event) => event.clientEventId).toList();

    test('accepts an empty acknowledgement', () {
      expect(
        validateAcknowledgements(
          batch,
          ReviewUploadResponse(acknowledgedClientEventIds: const []),
        ),
        isEmpty,
      );
    });

    test('accepts a full acknowledgement of the batch', () {
      expect(
        validateAcknowledgements(
          batch,
          ReviewUploadResponse(acknowledgedClientEventIds: batchIds),
        ),
        batchIds,
      );
    });

    test('accepts a valid partial subset', () {
      expect(
        validateAcknowledgements(
          batch,
          ReviewUploadResponse(acknowledgedClientEventIds: ['b']),
        ),
        ['b'],
      );
    });

    test('rejects an ID outside the batch', () {
      expect(
        () => validateAcknowledgements(
          batch,
          ReviewUploadResponse(acknowledgedClientEventIds: ['a', 'unknown']),
        ),
        throwsA(isA<InvalidReviewAcknowledgement>()),
      );
    });

    test('rejects duplicate acknowledgements', () {
      expect(
        () => validateAcknowledgements(
          batch,
          ReviewUploadResponse(acknowledgedClientEventIds: ['a', 'a']),
        ),
        throwsA(isA<InvalidReviewAcknowledgement>()),
      );
    });
  });

  group('ReviewSyncResult', () {
    test('Synchronized exposes exact counters', () {
      const result = ReviewSyncResult.synchronized(
        acknowledgedCount: 2,
        remainingCount: 1,
      );
      expect(result, isA<Synchronized>());
      switch (result) {
        case Synchronized(:final acknowledgedCount, :final remainingCount):
          expect(acknowledgedCount, 2);
          expect(remainingCount, 1);
        case AuthenticationRequired() || NothingPending() || RetryableFailure():
          fail('Expected a Synchronized result.');
      }
    });

    test('RetryableFailure exposes remainingCount', () {
      const result = ReviewSyncResult.retryableFailure(remainingCount: 3);
      expect(result, isA<RetryableFailure>());
      switch (result) {
        case RetryableFailure(:final remainingCount):
          expect(remainingCount, 3);
        case AuthenticationRequired() || NothingPending() || Synchronized():
          fail('Expected a RetryableFailure result.');
      }
    });

    test('exposes authenticationRequired and nothingPending variants', () {
      expect(
          ReviewSyncResult.authenticationRequired(), isA<ReviewSyncResult>());
      expect(ReviewSyncResult.nothingPending(), isA<ReviewSyncResult>());
    });
  });
}

class _EchoTransport implements ReviewSyncTransport {
  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async {
    return ReviewUploadResponse(
      acknowledgedClientEventIds:
          events.map((event) => event.clientEventId).toList(),
    );
  }
}
