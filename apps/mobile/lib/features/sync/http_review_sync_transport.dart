import 'dart:convert';

import 'package:learnbox/features/identity/mobile_session_store.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/sync/reconciliation_cursor_store.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

abstract interface class MobileReviewHttpClient {
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  });

  /// Performs the authenticated read-only GET used by the reconciliation read.
  Future<MobileReviewHttpResponse> getJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, String> queryParameters,
  });
}

class MobileReviewHttpResponse {
  const MobileReviewHttpResponse(
      {required this.statusCode, required this.body});

  final int statusCode;
  final String body;
}

class HttpReviewSyncTransport
    implements ReviewSyncTransport, ReviewReconciliationTransport {
  HttpReviewSyncTransport({
    required MobileSessionStore sessionStore,
    required MobileReviewHttpClient client,
    required Uri endpoint,
    Uri? reconciliationEndpoint,
    this.timeout = const Duration(seconds: 15),
  })  : _sessionStore = sessionStore,
        _client = client,
        _endpoint = endpoint,
        _reconciliationEndpoint = reconciliationEndpoint {
    if (!_isAllowedEndpoint(endpoint)) {
      throw ArgumentError.value(
        endpoint,
        'endpoint',
        'must use HTTPS, or HTTP only on loopback during development',
      );
    }
    if (reconciliationEndpoint != null &&
        !_isAllowedEndpoint(reconciliationEndpoint)) {
      throw ArgumentError.value(
        reconciliationEndpoint,
        'reconciliationEndpoint',
        'must use HTTPS, or HTTP only on loopback during development',
      );
    }
    if (timeout <= Duration.zero) {
      throw ArgumentError.value(timeout, 'timeout', 'must be positive');
    }
  }

  static const _maxBatchSize = 20;

  static bool _isAllowedEndpoint(Uri endpoint) {
    if (endpoint.userInfo.isNotEmpty || endpoint.path.isEmpty) {
      return false;
    }
    if (endpoint.scheme == 'https') {
      return true;
    }
    return endpoint.scheme == 'http' &&
        (endpoint.host == 'localhost' ||
            endpoint.host == '127.0.0.1' ||
            endpoint.host == '::1');
  }

  final MobileSessionStore _sessionStore;
  final MobileReviewHttpClient _client;
  final Uri _endpoint;
  final Uri? _reconciliationEndpoint;
  final Duration timeout;

  @override
  Future<ReviewUploadResponse> upload(
    List<PendingReviewEvent> events, {
    String? reconciliationCursor,
  }) async {
    if (events.length > _maxBatchSize) {
      throw const MobileReviewTransportException('validation');
    }
    final session = await _sessionStore.read();
    if (session == null) {
      throw const MobileReviewTransportException('authenticationRequired');
    }
    final body = <String, Object>{
      'items': events.map((event) => event.toJson()).toList(growable: false),
    };
    if (reconciliationCursor != null) {
      final parsedCursor = parseReconciliationCursor(reconciliationCursor);
      if (parsedCursor == null) {
        throw const MobileReviewTransportException('validation');
      }
      body['reconciliationCursor'] = parsedCursor;
    }
    final response = await _client
        .postJson(
          endpoint: _endpoint,
          accessToken: session.accessToken,
          body: body,
        )
        .timeout(timeout);
    if (response.statusCode != 200) {
      throw const MobileReviewTransportException('serverUnavailable');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic> ||
        decoded.length != 1 ||
        decoded['outcomes'] is! List) {
      throw const MobileReviewTransportException('validation');
    }
    final acknowledged = <String>[];
    String? acknowledgedCursor;
    for (final outcome in decoded['outcomes'] as List<Object?>) {
      if (outcome is! Map<String, dynamic> ||
          outcome['status'] != 'acknowledged') {
        continue;
      }
      final clientEventId = outcome['clientEventId'];
      // An acknowledged outcome must carry an exact non-empty client event id
      // and a valid non-negative decimal-string reconciliation cursor
      // (ADR 0014). A malformed acknowledged cursor makes the whole response
      // retryable with no acknowledgements.
      final cursor = parseReconciliationCursor(outcome['reconciliationCursor']);
      if (cursor == null || clientEventId is! String || clientEventId.isEmpty) {
        throw const MobileReviewTransportException('validation');
      }
      acknowledged.add(clientEventId);
      acknowledgedCursor = cursor;
    }
    return ReviewUploadResponse(
      acknowledgedClientEventIds: acknowledged,
      reconciliationCursor: acknowledgedCursor,
    );
  }

  @override
  Future<ReviewReconciliationPage> readReconciliation({String? after}) async {
    // A transport without an explicit reconciliation endpoint performs no
    // network call at all: the read fails closed instead of guessing a URL.
    final endpoint = _reconciliationEndpoint;
    if (endpoint == null) {
      throw const MobileReviewTransportException('validation');
    }
    final session = await _sessionStore.read();
    if (session == null) {
      throw const MobileReviewTransportException('authenticationRequired');
    }
    final queryParameters = <String, String>{};
    if (after != null) {
      final parsedAfter = parseReconciliationCursor(after);
      if (parsedAfter == null) {
        throw const MobileReviewTransportException('validation');
      }
      queryParameters['after'] = parsedAfter;
    }
    final response = await _client
        .getJson(
          endpoint: endpoint,
          accessToken: session.accessToken,
          queryParameters: queryParameters,
        )
        .timeout(timeout);
    if (response.statusCode != 200) {
      throw const MobileReviewTransportException('serverUnavailable');
    }
    return _parseReconciliationPage(response.body);
  }
}

/// Strictly parses one reconciliation page.
///
/// Any missing key, unknown key, wrong type, invalid cursor or `nextCursor`
/// behind the echoed cursor is rejected as a whole document, so a partial or
/// malformed response can never reach the cursor store.
ReviewReconciliationPage _parseReconciliationPage(String body) {
  final Object? decoded;
  try {
    decoded = jsonDecode(body);
  } catch (_) {
    throw const MobileReviewTransportException('validation');
  }
  if (decoded is! Map<String, dynamic> || decoded.length != 1) {
    throw const MobileReviewTransportException('validation');
  }
  final reconciliation = decoded['reconciliation'];
  if (reconciliation is! Map<String, dynamic> || reconciliation.length != 4) {
    throw const MobileReviewTransportException('validation');
  }
  final cursor = parseReconciliationCursor(reconciliation['cursor']);
  final nextCursor = parseReconciliationCursor(reconciliation['nextCursor']);
  final hasMore = reconciliation['hasMore'];
  final events = reconciliation['events'];
  if (cursor == null ||
      nextCursor == null ||
      hasMore is! bool ||
      events is! List) {
    throw const MobileReviewTransportException('validation');
  }
  if (compareReconciliationCursors(nextCursor, cursor) < 0) {
    throw const MobileReviewTransportException('validation');
  }
  final parsedEvents = <ReviewReconciliationEvent>[];
  for (final event in events) {
    if (event is! Map<String, dynamic> || event.length != 3) {
      throw const MobileReviewTransportException('validation');
    }
    final clientEventId = event['clientEventId'];
    final eventId = event['eventId'];
    final appliedAt = event['appliedAt'];
    if (clientEventId is! String ||
        clientEventId.isEmpty ||
        eventId is! String ||
        eventId.isEmpty ||
        appliedAt is! String ||
        appliedAt.isEmpty) {
      throw const MobileReviewTransportException('validation');
    }
    parsedEvents.add(ReviewReconciliationEvent(
      clientEventId: clientEventId,
      eventId: eventId,
      appliedAt: appliedAt,
    ));
  }
  return ReviewReconciliationPage(
    cursor: cursor,
    nextCursor: nextCursor,
    hasMore: hasMore,
    events: parsedEvents,
  );
}

class MobileReviewTransportException implements Exception {
  const MobileReviewTransportException(this.code);

  final String code;

  @override
  String toString() => 'MobileReviewTransportException($code)';
}
