import 'dart:convert';

import 'package:learnbox/features/identity/mobile_session_store.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/sync/review_sync_transport.dart';

abstract interface class MobileReviewHttpClient {
  Future<MobileReviewHttpResponse> postJson({
    required Uri endpoint,
    required String accessToken,
    required Map<String, Object> body,
  });
}

class MobileReviewHttpResponse {
  const MobileReviewHttpResponse(
      {required this.statusCode, required this.body});

  final int statusCode;
  final String body;
}

class HttpReviewSyncTransport implements ReviewSyncTransport {
  HttpReviewSyncTransport({
    required MobileSessionStore sessionStore,
    required MobileReviewHttpClient client,
    required Uri endpoint,
    this.timeout = const Duration(seconds: 15),
  })  : _sessionStore = sessionStore,
        _client = client,
        _endpoint = endpoint;

  final MobileSessionStore _sessionStore;
  final MobileReviewHttpClient _client;
  final Uri _endpoint;
  final Duration timeout;

  @override
  Future<ReviewUploadResponse> upload(List<PendingReviewEvent> events) async {
    final session = await _sessionStore.read();
    if (session == null) {
      throw const MobileReviewTransportException('authenticationRequired');
    }
    final response = await _client.postJson(
      endpoint: _endpoint,
      accessToken: session.accessToken,
      body: <String, Object>{
        'items': events.map((event) => event.toJson()).toList(growable: false),
      },
    ).timeout(timeout);
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
    for (final outcome in decoded['outcomes'] as List<Object?>) {
      if (outcome is! Map<String, dynamic> ||
          outcome['status'] != 'acknowledged') {
        continue;
      }
      final clientEventId = outcome['clientEventId'];
      if (clientEventId is String && clientEventId.isNotEmpty) {
        acknowledged.add(clientEventId);
      }
    }
    return ReviewUploadResponse(acknowledgedClientEventIds: acknowledged);
  }
}

class MobileReviewTransportException implements Exception {
  const MobileReviewTransportException(this.code);

  final String code;

  @override
  String toString() => 'MobileReviewTransportException($code)';
}
