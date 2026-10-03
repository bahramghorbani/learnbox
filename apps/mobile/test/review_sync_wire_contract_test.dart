import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/sync/http_review_sync_transport.dart';
import 'package:learnbox/features/sync/mobile_identity_state.dart';
import 'package:learnbox/features/sync/review_sync_coordinator.dart';
import 'package:learnbox/features/sync/review_sync_result.dart';

/// LB-B35 CP15 (Workstream A): native conformance to the canonical review-sync wire contract.
///
/// This test does NOT restate the contract. It loads
/// `test/fixtures/review_sync_wire_contract.json`, which is GENERATED from
/// `packages/learning-engine/src/review-sync-wire-contract.ts` by
/// `scripts/sync-review-sync-wire-contract.mjs` and kept in sync by
/// `pnpm verify:review-sync-wire-contract` inside the required `quality` job.
///
/// That is what makes a server-side rename fail CI instead of silently turning the deterministic
/// rejection into a retryable failure here:
///
///  * rename the discriminator and forget the fixture -> `quality` fails on drift;
///  * rename it and regenerate the fixture -> this test feeds native the NEW code, the transport
///    does not recognise it as the contract, the terminal expectation fails, `mobile` fails.
///
/// So the contract cannot change on one side only.
void main() {
  final fixture = jsonDecode(
    File('test/fixtures/review_sync_wire_contract.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  final rejection = fixture['schedulerRejected'] as Map<String, dynamic>;
  final rejectionStatus = rejection['status'] as int;
  final rejectionBody = jsonEncode(rejection['body']);

  const session = MobileSession(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    sessionId: 'session-id',
  );
  final endpoint = Uri.parse('https://learnbox.example/api/reviews/mobile');

  PendingReviewEvent event(String id) => PendingReviewEvent(
        clientEventId: id,
        cardId: 'start-a1-haus',
        grade: ReviewGrade.remembered,
        occurredAt: DateTime.utc(2026, 8, 24, 12),
      );

  HttpReviewSyncTransport transportFor(_FakeClient client) =>
      HttpReviewSyncTransport(
        sessionStore: _FakeStore(session),
        client: client,
        endpoint: endpoint,
      );

  group('canonical contract fixture', () {
    test('pins the deterministic refusal the boundaries actually send', () {
      // Guards against a fixture that silently degenerates into something vacuous.
      expect(rejectionStatus, 422);
      expect(rejection['body'], isA<Map<String, dynamic>>());
      expect((rejection['body'] as Map<String, dynamic>).length, 1);
      expect((rejection['body'] as Map<String, dynamic>).keys.single, 'error');
      // Pinned to the literal ON PURPOSE. The Dart transport cannot import the canonical
      // TypeScript constant, so http_review_sync_transport.dart hardcodes this string at its
      // match site. Asserting the value here (not just isA<String>()) means a renamed contract
      // fails with "the native client's hardcoded expectation must be updated" instead of
      // silently satisfying a vacuous type check.
      expect(
        (rejection['body'] as Map<String, dynamic>)['error'],
        'schedulerRejected',
      );
      expect(rejection['terminal'], isTrue);
      expect(rejection['retryable'], isFalse);
      expect(fixture['nearMisses'], isA<List<dynamic>>());
      expect((fixture['nearMisses'] as List<dynamic>), isNotEmpty);
    });
  });

  group('transport conformance', () {
    test('maps the canonical refusal to a terminal, non-retryable exception',
        () async {
      final transport = transportFor(_FakeClient(MobileReviewHttpResponse(
        statusCode: rejectionStatus,
        body: rejectionBody,
      )));

      await expectLater(
        transport.upload([event('event-1')]),
        throwsA(
          isA<MobileReviewTransportException>()
              .having((e) => e.retryable, 'retryable', isFalse),
        ),
      );
    });

    test('keeps every non-contract shape retryable', () async {
      for (final nearMiss in fixture['nearMisses'] as List<dynamic>) {
        final entry = nearMiss as Map<String, dynamic>;
        final transport = transportFor(_FakeClient(MobileReviewHttpResponse(
          statusCode: entry['status'] as int,
          body: entry['rawBody'] as String,
        )));

        await expectLater(
          transport.upload([event('event-1')]),
          throwsA(
            isA<MobileReviewTransportException>()
                .having((e) => e.retryable, 'retryable', isTrue),
          ),
          reason: 'A near miss must stay retryable: ${entry['label']}',
        );
      }
    });

    test('keeps every pinned non-rejection code retryable', () async {
      for (final nonRejection in fixture['nonRejections'] as List<dynamic>) {
        final entry = nonRejection as Map<String, dynamic>;
        final transport = transportFor(_FakeClient(MobileReviewHttpResponse(
          statusCode: entry['status'] as int,
          body: jsonEncode({'error': entry['code']}),
        )));

        await expectLater(
          transport.upload([event('event-1')]),
          throwsA(
            isA<MobileReviewTransportException>().having(
              (e) => e.retryable,
              'retryable',
              entry['retryable'] as bool,
            ),
          ),
          reason:
              'Pinned non-rejection changed classification: ${entry['code']}',
        );
      }
    });
  });

  group('coordinator conformance', () {
    test('reports SchedulerRejected and leaves the queue fully intact',
        () async {
      final store = _MemoryQueueStore();
      final queue = ReviewQueue(store: store);
      await queue.record('start-a1-haus', ReviewGrade.remembered,
          DateTime.utc(2026, 8, 24, 12));
      await queue.record(
          'start-a1-tisch', ReviewGrade.forgot, DateTime.utc(2026, 8, 24, 13));
      final before = await queue.pendingEvents();

      final client = _FakeClient(MobileReviewHttpResponse(
        statusCode: rejectionStatus,
        body: rejectionBody,
      ));
      final coordinator = ReviewSyncCoordinator(
        queue: queue,
        identityState: () => MobileIdentityState.authenticated,
        transport: transportFor(client),
      );

      final result = await coordinator.synchronize();

      expect(result, isA<SchedulerRejected>());
      switch (result) {
        case SchedulerRejected(:final remainingCount):
          // Nothing acknowledged: the deterministic refusal must not drop a learner answer.
          expect(remainingCount, before.length);
        default:
          fail('Expected a SchedulerRejected result.');
      }

      final after = await queue.pendingEvents();
      expect(after.length, before.length);
      expect(
        after.map((e) => e.clientEventId),
        before.map((e) => e.clientEventId),
        reason: 'The queue must survive a deterministic refusal byte-for-byte.',
      );
      expect(
        after.map((e) => jsonEncode(e.toJson())),
        before.map((e) => jsonEncode(e.toJson())),
        reason: 'A refusal must not rewrite queued payloads.',
      );
    });

    test('does not arm a retry timer or consume retry budget', () async {
      final store = _MemoryQueueStore();
      final queue = ReviewQueue(store: store);
      await queue.record('start-a1-haus', ReviewGrade.remembered,
          DateTime.utc(2026, 8, 24, 12));

      final client = _FakeClient(MobileReviewHttpResponse(
        statusCode: rejectionStatus,
        body: rejectionBody,
      ));
      final coordinator = ReviewSyncCoordinator(
        queue: queue,
        identityState: () => MobileIdentityState.authenticated,
        transport: transportFor(client),
      );

      await coordinator.synchronize();
      // Exactly one delivery attempt: a deterministic refusal is never re-POSTed in the same pass.
      expect(client.postCalls, 1);

      // A second explicit pass is the learner's choice, not an automatic retry, and it must still
      // refuse deterministically rather than escalate.
      final second = await coordinator.synchronize();
      expect(second, isA<SchedulerRejected>());
      expect(client.postCalls, 2);
    });
  });
}

class _FakeStore implements MobileSessionStore {
  _FakeStore(this.value);
  final MobileSession? value;

  @override
  Future<MobileSession?> read() async => value;

  @override
  Future<void> write(MobileSession session) async {}

  @override
  Future<void> clear() async {}
}

class _FakeClient implements MobileReviewHttpClient {
  _FakeClient(this.response);

  final MobileReviewHttpResponse response;
  var postCalls = 0;

  @override
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  }) async {
    postCalls += 1;
    return response;
  }

  @override
  Future<MobileReviewHttpResponse> getJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, String> queryParameters,
  }) async =>
      const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"events":[],"cursor":"0","hasMore":false}',
      );
}

class _MemoryQueueStore implements ReviewQueueStore {
  String? _value;

  @override
  Future<String?> read() async => _value;

  @override
  Future<void> write(String serialized) async {
    _value = serialized;
  }
}
