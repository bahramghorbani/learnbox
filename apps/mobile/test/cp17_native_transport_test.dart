import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';
import 'package:learnbox/features/review/binary_response.dart';
import 'package:learnbox/features/review/binary_review_ui_config.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/sync/http_review_sync_transport.dart';

/// CP17 F4/F2 — real Native transport behaviour.
///
/// Production Native currently wires `DisabledReviewSyncTransport`, so the HTTP
/// transport's real serialization/parsing path was never exercised for binary
/// events. These tests drive the actual [HttpReviewSyncTransport] — the class a
/// rollout would ship — rather than a contract double.
class _FakeSessionStore implements MobileSessionStore {
  @override
  Future<MobileSession?> read() async => const MobileSession(
        accessToken: 'token',
        refreshToken: 'refresh',
        sessionId: 'session-id',
      );

  @override
  Future<void> write(MobileSession session) async {}

  @override
  Future<void> clear() async {}
}

class _RecordingClient implements MobileReviewHttpClient {
  _RecordingClient(this.response);

  MobileReviewHttpResponse response;
  Map<String, Object>? lastBody;

  @override
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  }) async {
    lastBody = body;
    return response;
  }

  @override
  Future<MobileReviewHttpResponse> getJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, String> queryParameters,
  }) async =>
      response;
}

// ignore: library_private_types_in_public_api
HttpReviewSyncTransport transportFor(_RecordingClient client) =>
    HttpReviewSyncTransport(
      sessionStore: _FakeSessionStore(),
      client: client,
      endpoint: Uri.parse('https://app.learnboxapp.com/api/reviews/mobile'),
    );

String okBody({
  List<Map<String, Object?>> outcomes = const [],
  Map<String, Object?>? binaryReview,
}) =>
    jsonEncode({
      'outcomes': outcomes,
      if (binaryReview != null) 'binaryReview': binaryReview,
    });

void main() {
  group('CP17 F4 — real transport serialization', () {
    test('a binary event serializes to `response` with no `grade`', () async {
      final client = _RecordingClient(
        MobileReviewHttpResponse(statusCode: 200, body: okBody()),
      );
      await transportFor(client).upload([
        PendingReviewEvent.binary(
          clientEventId: 'evt-b1',
          cardId: 'start-a1-apfel',
          response: BinaryResponse.known,
          occurredAt: DateTime.utc(2026, 8, 24, 12),
        ),
      ]);

      final items =
          (client.lastBody!['items'] as List).cast<Map<String, Object?>>();
      expect(items.single['response'], 'known');
      expect(items.single.containsKey('grade'), isFalse);
      // The wire contract uses contentId, never cardId.
      expect(items.single['contentId'], 'start-a1-apfel');
      expect(items.single.containsKey('cardId'), isFalse);
    });

    test('a legacy event still serializes to `grade` with no `response`',
        () async {
      final client = _RecordingClient(
        MobileReviewHttpResponse(statusCode: 200, body: okBody()),
      );
      await transportFor(client).upload([
        PendingReviewEvent(
          clientEventId: 'evt-1',
          cardId: 'start-a1-apfel',
          grade: ReviewGrade.remembered,
          occurredAt: DateTime.utc(2026, 8, 24, 12),
        ),
      ]);

      final items =
          (client.lastBody!['items'] as List).cast<Map<String, Object?>>();
      expect(items.single['grade'], 'remembered');
      expect(items.single.containsKey('response'), isFalse);
    });

    test('a mixed legacy/binary batch is sent in one request', () async {
      final client = _RecordingClient(
        MobileReviewHttpResponse(statusCode: 200, body: okBody()),
      );
      await transportFor(client).upload([
        PendingReviewEvent(
          clientEventId: 'evt-1',
          cardId: 'card-1',
          grade: ReviewGrade.forgot,
          occurredAt: DateTime.utc(2026, 8, 24, 12),
        ),
        PendingReviewEvent.binary(
          clientEventId: 'evt-b1',
          cardId: 'card-2',
          response: BinaryResponse.unknown,
          occurredAt: DateTime.utc(2026, 8, 24, 12, 1),
        ),
      ]);

      final items =
          (client.lastBody!['items'] as List).cast<Map<String, Object?>>();
      expect(items, hasLength(2));
      expect(items[0]['grade'], 'forgot');
      expect(items[1]['response'], 'unknown');
    });
  });

  group('CP17 F2 — transport reads the runtime kill switch', () {
    test('parses the advertised switch', () async {
      final client = _RecordingClient(
        MobileReviewHttpResponse(
          statusCode: 200,
          body: okBody(
            binaryReview: {'creationEnabled': false, 'acceptanceEnabled': true},
          ),
        ),
      );
      final result = await transportFor(client).upload(const []);
      expect(result.binaryReview.creationEnabled, isFalse);
      expect(result.binaryReview.acceptanceEnabled, isTrue);
      // Creation withdrawn by the server must suppress the UI regardless of the
      // compile-time define's value in this build.
      expect(result.binaryReview.showsBinaryReview, isFalse);
    });

    test('a response without the switch stays backward compatible', () async {
      // An older server that never learned about the switch must not break sync.
      final client = _RecordingClient(
        MobileReviewHttpResponse(statusCode: 200, body: okBody()),
      );
      final result = await transportFor(client).upload(const []);
      expect(result.binaryReview, BinaryReviewRuntimeConfig.unknown);
      // Acceptance is assumed available so queued binary events keep draining.
      expect(result.binaryReview.acceptanceEnabled, isTrue);
    });

    test('a garbage switch degrades safely instead of enabling anything',
        () async {
      final client = _RecordingClient(
        MobileReviewHttpResponse(
          statusCode: 200,
          body: jsonEncode({'outcomes': [], 'binaryReview': 'not-an-object'}),
        ),
      );
      final result = await transportFor(client).upload(const []);
      expect(result.binaryReview, BinaryReviewRuntimeConfig.unknown);
    });

    test('an unknown top-level key is still refused', () async {
      // Relaxing the envelope for `binaryReview` must not relax it in general.
      final client = _RecordingClient(
        MobileReviewHttpResponse(
          statusCode: 200,
          body: jsonEncode({'outcomes': [], 'somethingElse': true}),
        ),
      );
      await expectLater(
        transportFor(client).upload(const []),
        throwsA(
          isA<MobileReviewTransportException>()
              .having((e) => e.code, 'code', 'validation'),
        ),
      );
    });
  });

  group('CP17 — failure classification through the real transport', () {
    test('the exact 422 contract is terminal and non-retryable', () async {
      final client = _RecordingClient(
        MobileReviewHttpResponse(
          statusCode: 422,
          body: jsonEncode({'error': 'schedulerRejected'}),
        ),
      );
      await expectLater(
        transportFor(client).upload(const []),
        throwsA(
          isA<MobileReviewTransportException>()
              .having((e) => e.code, 'code', 'schedulerRejected')
              .having((e) => e.retryable, 'retryable', isFalse),
        ),
      );
    });

    test('a 503 capability gap stays retryable so events are not lost',
        () async {
      // CP17 F5: a flag regression answers 503. It must remain retryable, because the
      // identical event becomes valid again once the flag is restored.
      final client = _RecordingClient(
        MobileReviewHttpResponse(
          statusCode: 503,
          body: jsonEncode({'error': 'serverUnavailable'}),
        ),
      );
      await expectLater(
        transportFor(client).upload(const []),
        throwsA(
          isA<MobileReviewTransportException>()
              .having((e) => e.code, 'code', 'serverUnavailable')
              .having((e) => e.retryable, 'retryable', isTrue),
        ),
      );
    });

    test('a per-item validation outcome does not acknowledge the event',
        () async {
      // Head-of-line salvage: the invalid item is reported, the valid one acknowledged.
      final client = _RecordingClient(
        MobileReviewHttpResponse(
          statusCode: 200,
          body: okBody(
            outcomes: [
              {
                'status': 'acknowledged',
                'clientEventId': 'evt-good',
                'reconciliationCursor': '42',
              },
              {'status': 'validation', 'clientEventId': 'evt-bad'},
            ],
          ),
        ),
      );
      final result = await transportFor(client).upload(const []);
      expect(result.acknowledgedClientEventIds, ['evt-good']);
      expect(result.reconciliationCursor, '42');
    });
  });
}
