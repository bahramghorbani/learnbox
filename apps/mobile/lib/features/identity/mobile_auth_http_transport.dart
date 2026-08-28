import 'dart:convert';
import 'dart:io';

import 'mobile_auth_http_client.dart';

/// dart:io transport for the owner-controlled native Preview auth client.
///
/// The endpoint is validated by [MobileAuthHttpClient] as well; this transport
/// independently rejects non-HTTPS and non-root-host requests before opening a
/// socket. It never logs request or response content.
class DartIoMobileAuthHttpTransport implements MobileAuthHttpTransport {
  DartIoMobileAuthHttpTransport({HttpClient? client})
      : _client = client ?? HttpClient();

  final HttpClient _client;

  @override
  Future<MobileAuthHttpResponse> postJson({
    required String method,
    required Uri endpoint,
    required Map<String, Object> body,
    String? accessToken,
  }) async {
    if (method != 'POST' || !_isAllowedEndpoint(endpoint)) {
      throw const MobileAuthException('validation');
    }

    try {
      final request = await _client.postUrl(endpoint);
      request.headers.contentType = ContentType.json;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (accessToken != null && accessToken.isNotEmpty) {
        request.headers.set(
          HttpHeaders.authorizationHeader,
          'Bearer $accessToken',
        );
      }
      request.write(jsonEncode(body));
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();
      return MobileAuthHttpResponse(
        statusCode: response.statusCode,
        contentType: response.headers.contentType?.toString() ?? '',
        body: responseBody,
      );
    } on MobileAuthException {
      rethrow;
    } on SocketException {
      throw const MobileAuthException('serverUnavailable');
    } on HttpException {
      throw const MobileAuthException('serverUnavailable');
    } on FormatException {
      throw const MobileAuthException('validation');
    }
  }

  static bool _isAllowedEndpoint(Uri endpoint) =>
      endpoint.scheme == 'https' &&
      endpoint.host.isNotEmpty &&
      endpoint.userInfo.isEmpty &&
      !endpoint.hasPort &&
      !endpoint.hasQuery &&
      !endpoint.hasFragment &&
      endpoint.path.isNotEmpty;
}
