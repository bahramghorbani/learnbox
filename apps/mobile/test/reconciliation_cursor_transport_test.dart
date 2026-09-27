import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/sync/http_review_sync_transport.dart';

void main() {
  final event = PendingReviewEvent(
    clientEventId: 'event-1',
    cardId: 'start-a1-haus',
    grade: ReviewGrade.remembered,
    occurredAt: DateTime.utc(2026, 8, 24, 12),
  );
  const session = MobileSession(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    sessionId: 'session-id',
  );
  final endpoint = Uri.parse('https://learnbox.example/api/reviews/mobile');
  final reconciliationEndpoint =
      Uri.parse('https://learnbox.example/api/reviews/mobile/reconciliation');

  group('HttpReviewSyncTransport.upload', () {
    HttpReviewSyncTransport transportFor(_FakeClient client) =>
        HttpReviewSyncTransport(
          sessionStore: _FakeStore(session),
          client: client,
          endpoint: endpoint,
        );

    test('parses an acknowledged outcome with a decimal-string cursor',
        () async {
      final transport = transportFor(_FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body:
            '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":"42"}]}',
      )));

      final result = await transport.upload([event]);

      expect(result.acknowledgedClientEventIds, ['event-1']);
      expect(result.reconciliationCursor, '42');
    });

    test('does not return a cursor when no outcome is acknowledged', () async {
      final transport = transportFor(_FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body:
            '{"outcomes":[{"status":"validation","clientEventId":"event-1"}]}',
      )));

      final result = await transport.upload([event]);

      expect(result.acknowledgedClientEventIds, isEmpty);
      expect(result.reconciliationCursor, isNull);
    });

    test('keeps one-key HTTP request shape without a cursor field', () async {
      final client = _FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"outcomes":[]}',
      ));
      final transport = transportFor(client);

      await transport.upload([event]);

      expect(client.body?.keys, ['items']);
    });

    for (final malformed in <String>[
      // Missing cursor on an acknowledged outcome.
      '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false}]}',
      // Empty cursor on an acknowledged outcome.
      '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":""}]}',
      // Negative cursor.
      '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":"-1"}]}',
      // Non-decimal cursor.
      '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":"1.5"}]}',
      // Non-string cursor (JS number).
      '{"outcomes":[{"status":"acknowledged","clientEventId":"event-1","eventId":"e","idempotent":false,"reconciliationCursor":42}]}',
    ]) {
      test('rejects malformed acknowledged cursor $malformed', () async {
        final transport = transportFor(_FakeClient(MobileReviewHttpResponse(
          statusCode: 200,
          body: malformed,
        )));

        await expectLater(
          transport.upload([event]),
          throwsA(isA<MobileReviewTransportException>()),
        );
      });
    }

    test('rejects a response with an extra top-level key', () async {
      final transport = transportFor(_FakeClient(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"outcomes":[],"reconciliationCursor":"1"}',
      )));

      await expectLater(
        transport.upload([event]),
        throwsA(isA<MobileReviewTransportException>()),
      );
    });
  });

  group('HttpReviewSyncTransport.readReconciliation', () {
    HttpReviewSyncTransport build(
      _FakeClient client, {
      bool authenticated = true,
      bool withReconciliationEndpoint = true,
    }) =>
        HttpReviewSyncTransport(
          sessionStore: _FakeStore(authenticated ? session : null),
          client: client,
          endpoint: endpoint,
          reconciliationEndpoint:
              withReconciliationEndpoint ? reconciliationEndpoint : null,
        );

    test('strictly reads one page and requests the stored cursor', () async {
      final client = _FakeClient.reconciliation(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"reconciliation":{"cursor":"42","nextCursor":"47",'
            '"hasMore":false,"events":[{"clientEventId":"evt_a",'
            '"eventId":"9f1c","appliedAt":"2026-09-05T08:20:01.000Z"}]}}',
      ));

      final page = await build(client).readReconciliation(after: '42');

      expect(page.cursor, '42');
      expect(page.nextCursor, '47');
      expect(page.hasMore, isFalse);
      expect(page.events.map((event) => event.clientEventId), ['evt_a']);
      expect(page.events.single.eventId, '9f1c');
      expect(page.events.single.appliedAt, '2026-09-05T08:20:01.000Z');
      expect(client.lastQuery?['after'], '42');
      expect(client.accessToken, 'access-token');
    });

    test('reads the empty zero state without an after parameter', () async {
      final client = _FakeClient.reconciliation(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"reconciliation":{"cursor":"0","nextCursor":"0",'
            '"hasMore":false,"events":[]}}',
      ));

      final page = await build(client).readReconciliation();

      expect(page.cursor, '0');
      expect(page.nextCursor, '0');
      expect(page.hasMore, isFalse);
      expect(page.events, isEmpty);
      expect(client.lastQuery?.containsKey('after'), isFalse);
    });

    test('rejects a non-200 reconciliation response', () async {
      final client = _FakeClient.reconciliation(const MobileReviewHttpResponse(
        statusCode: 503,
        body: '{"error":"serverUnavailable"}',
      ));

      await expectLater(
        build(client).readReconciliation(after: '1'),
        throwsA(isA<MobileReviewTransportException>()),
      );
    });

    test('requires an authenticated session before any read', () async {
      final client = _FakeClient.reconciliation(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"reconciliation":{"cursor":"0","nextCursor":"0",'
            '"hasMore":false,"events":[]}}',
      ));

      await expectLater(
        build(client, authenticated: false).readReconciliation(),
        throwsA(isA<MobileReviewTransportException>()),
      );
      expect(client.getCalls, 0);
    });

    test('rejects a transport without a reconciliation endpoint', () async {
      final client = _FakeClient.reconciliation(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"reconciliation":{"cursor":"0","nextCursor":"0",'
            '"hasMore":false,"events":[]}}',
      ));

      await expectLater(
        build(client, withReconciliationEndpoint: false).readReconciliation(),
        throwsA(isA<MobileReviewTransportException>()),
      );
      expect(client.getCalls, 0);
    });

    test('rejects a non-decimal stored cursor before any network call',
        () async {
      final client = _FakeClient.reconciliation(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{"reconciliation":{"cursor":"0","nextCursor":"0",'
            '"hasMore":false,"events":[]}}',
      ));

      await expectLater(
        build(client).readReconciliation(after: 'not-a-cursor'),
        throwsA(isA<MobileReviewTransportException>()),
      );
      expect(client.getCalls, 0);
    });

    test('rejects non-loopback HTTP reconciliation endpoints', () {
      expect(
        () => HttpReviewSyncTransport(
          sessionStore: _FakeStore(session),
          client: _FakeClient.reconciliation(const MobileReviewHttpResponse(
            statusCode: 200,
            body: '{}',
          )),
          endpoint: endpoint,
          reconciliationEndpoint: Uri.parse(
              'http://learnbox.example/api/reviews/mobile/reconciliation'),
        ),
        throwsArgumentError,
      );
    });

    test('propagates a lost connection as a retryable failure', () async {
      final client = _FakeClient.reconciliation(const MobileReviewHttpResponse(
        statusCode: 200,
        body: '{}',
      ))
        ..failGets = true;

      await expectLater(
        build(client).readReconciliation(after: '1'),
        throwsA(isA<StateError>()),
      );
    });

    for (final malformed in <String>[
      // Wrong top-level key.
      '{"outcomes":[]}',
      // Extra top-level key.
      '{"reconciliation":{"cursor":"0","nextCursor":"0","hasMore":false,"events":[]},"extra":true}',
      // Missing nextCursor.
      '{"reconciliation":{"cursor":"0","hasMore":false,"events":[]}}',
      // Missing events.
      '{"reconciliation":{"cursor":"0","nextCursor":"0","hasMore":false}}',
      // Extra key inside the reconciliation object.
      '{"reconciliation":{"cursor":"0","nextCursor":"0","hasMore":false,"events":[],"extra":1}}',
      // Negative cursor.
      '{"reconciliation":{"cursor":"-1","nextCursor":"0","hasMore":false,"events":[]}}',
      // Non-decimal nextCursor.
      '{"reconciliation":{"cursor":"0","nextCursor":"1.5","hasMore":false,"events":[]}}',
      // Numeric (non-string) nextCursor.
      '{"reconciliation":{"cursor":"0","nextCursor":1,"hasMore":false,"events":[]}}',
      // nextCursor behind the echoed cursor.
      '{"reconciliation":{"cursor":"42","nextCursor":"41","hasMore":false,"events":[]}}',
      // hasMore is not a boolean.
      '{"reconciliation":{"cursor":"0","nextCursor":"0","hasMore":"false","events":[]}}',
      // events is not a list.
      '{"reconciliation":{"cursor":"0","nextCursor":"0","hasMore":false,"events":{}}}',
      // Event entry is not an object.
      '{"reconciliation":{"cursor":"0","nextCursor":"1","hasMore":false,"events":[1]}}',
      // Event entry is missing clientEventId.
      '{"reconciliation":{"cursor":"0","nextCursor":"1","hasMore":false,"events":[{"eventId":"e","appliedAt":"t"}]}}',
      // Event entry has an empty clientEventId.
      '{"reconciliation":{"cursor":"0","nextCursor":"1","hasMore":false,"events":[{"clientEventId":"","eventId":"e","appliedAt":"t"}]}}',
      // Event entry is missing eventId.
      '{"reconciliation":{"cursor":"0","nextCursor":"1","hasMore":false,"events":[{"clientEventId":"c","appliedAt":"t"}]}}',
      // Event entry has an empty appliedAt.
      '{"reconciliation":{"cursor":"0","nextCursor":"1","hasMore":false,"events":[{"clientEventId":"c","eventId":"e","appliedAt":""}]}}',
      // Event entry has an extra key.
      '{"reconciliation":{"cursor":"0","nextCursor":"1","hasMore":false,"events":[{"clientEventId":"c","eventId":"e","appliedAt":"t","extra":1}]}}',
      // Not JSON at all.
      'not json',
    ]) {
      test('rejects a malformed reconciliation page: $malformed', () async {
        final client = _FakeClient.reconciliation(MobileReviewHttpResponse(
          statusCode: 200,
          body: malformed,
        ));

        await expectLater(
          build(client).readReconciliation(after: '0'),
          throwsA(isA<MobileReviewTransportException>()),
        );
      });
    }
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
  _FakeClient(this.response) : getResponse = response;

  _FakeClient.reconciliation(this.getResponse)
      : response = const MobileReviewHttpResponse(
          statusCode: 200,
          body: '{"outcomes":[]}',
        );

  final MobileReviewHttpResponse response;
  final MobileReviewHttpResponse getResponse;
  String? accessToken;
  Map<String, Object>? body;
  Map<String, String>? lastQuery;
  Uri? lastGetEndpoint;
  var getCalls = 0;
  var failGets = false;

  @override
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  }) async {
    this.accessToken = accessToken;
    this.body = body;
    return response;
  }

  @override
  Future<MobileReviewHttpResponse> getJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, String> queryParameters,
  }) async {
    getCalls += 1;
    lastGetEndpoint = endpoint;
    lastQuery = queryParameters;
    if (failGets) {
      throw StateError('Connection lost.');
    }
    this.accessToken = accessToken;
    return getResponse;
  }
}
