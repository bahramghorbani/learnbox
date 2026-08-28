import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/identity/mobile_auth_client.dart';
import 'package:learnbox/features/identity/mobile_auth_http_client.dart';
import 'package:learnbox/features/identity/mobile_auth_screen.dart';
import 'package:learnbox/features/identity/mobile_session.dart';
import 'package:learnbox/features/identity/mobile_session_store.dart';

void main() {
  final origin = Uri.parse('https://preview.learnbox.example');

  Widget harness(MobileAuthHttpResponse response) {
    return MaterialApp(
      locale: const Locale('fa'),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: MobileAuthScreen(
          authClient: MobileAuthClient(
            origin: origin,
            http: _FakeHttpTransport(response),
            store: _FakeSessionStore(),
          ),
          installationId: 'installation-test',
        ),
      ),
    );
  }

  testWidgets('phone entry exposes Persian labels and no token material',
      (tester) async {
    await tester.pumpWidget(harness(_challengeResponse));

    expect(find.text('به LearnBox خوش آمدی'), findsOneWidget);
    expect(find.text('برای ادامه، شمارهٔ موبایل خودت را وارد کن.'),
        findsOneWidget);
    expect(find.bySemanticsLabel('شماره موبایل'), findsOneWidget);
    expect(find.text('ارسال کد ورود'), findsOneWidget);
    expect(find.textContaining('accessToken'), findsNothing);
    expect(find.textContaining('refreshToken'), findsNothing);
  });

  testWidgets('invalid phone is announced inline without requesting',
      (tester) async {
    final transport = _FakeHttpTransport(_challengeResponse);
    await tester.pumpWidget(_harnessWithTransport(transport));

    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pump();

    expect(find.text('شماره موبایل را کامل وارد کن.'), findsOneWidget);
    expect(transport.calls, isEmpty);
  });

  testWidgets('Persian phone digits normalize before the injected request',
      (tester) async {
    final transport = _FakeHttpTransport(_challengeResponse);
    await tester.pumpWidget(_harnessWithTransport(transport));

    await tester.enterText(
        find.bySemanticsLabel('شماره موبایل'), '۰۹۱۲۱۲۳۴۵۶۷');
    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pumpAndSettle();

    expect(transport.bodies.single['phone'], '09121234567');
  });

  testWidgets('requesting state preserves layout and opens OTP entry',
      (tester) async {
    final transport = _FakeHttpTransport(_challengeResponse);
    await tester.pumpWidget(_harnessWithTransport(transport));

    await tester.enterText(
        find.bySemanticsLabel('شماره موبایل'), '09121234567');
    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pump();

    expect(find.bySemanticsLabel('شماره موبایل'), findsNothing);

    await tester.pumpAndSettle();
    expect(find.text('کد پیامک‌شده را وارد کن'), findsOneWidget);
    expect(find.bySemanticsLabel('کد یک‌بارمصرف پنج رقمی'), findsOneWidget);
    expect(find.text('تأیید کد'), findsOneWidget);
  });

  testWidgets('server failure is recoverable and keeps phone entry',
      (tester) async {
    await tester.pumpWidget(harness(const MobileAuthHttpResponse(
      statusCode: 503,
      contentType: 'application/json',
      body: '{}',
    )));

    await tester.enterText(
        find.bySemanticsLabel('شماره موبایل'), '09121234567');
    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pumpAndSettle();

    expect(find.text('فعلاً امکان ارسال کد نیست. دوباره تلاش کن.'),
        findsOneWidget);
    expect(find.bySemanticsLabel('شماره موبایل'), findsOneWidget);
  });

  testWidgets('Preview access failure explains owner-only environment',
      (tester) async {
    await tester.pumpWidget(harness(const MobileAuthHttpResponse(
      statusCode: 401,
      contentType: 'text/plain',
      body: 'platform protection',
    )));

    await tester.enterText(
        find.bySemanticsLabel('شماره موبایل'), '09121234567');
    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pumpAndSettle();

    expect(
        find.text(
            'این محیط Preview نیاز به دسترسی مالک دارد؛ بعداً دوباره تلاش کن.'),
        findsOneWidget);
    expect(
        find.text('فعلاً امکان ارسال کد نیست. دوباره تلاش کن.'), findsNothing);
  });

  testWidgets('back changes the number without exposing session data',
      (tester) async {
    final transport = _FakeHttpTransport(_challengeResponse);
    await tester.pumpWidget(_harnessWithTransport(transport));
    await tester.enterText(
        find.bySemanticsLabel('شماره موبایل'), '09121234567');
    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('تغییر شماره'));
    await tester.pump();

    expect(find.text('به LearnBox خوش آمدی'), findsOneWidget);
    expect(find.text('کد پیامک‌شده را وارد کن'), findsNothing);
  });

  testWidgets('Persian OTP digits normalize before verification',
      (tester) async {
    final transport = _SequenceTransport([
      _challengeResponse,
      MobileAuthHttpResponse(
        statusCode: 200,
        contentType: 'application/json',
        body: _fixtureSessionBody(),
      ),
    ]);
    await tester.pumpWidget(_harnessWithTransport(transport));
    await tester.enterText(
        find.bySemanticsLabel('شماره موبایل'), '۰۹۱۲۱۲۳۴۵۶۷');
    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.bySemanticsLabel('کد یک‌بارمصرف پنج رقمی'), '۱۲۳۴۵');
    await tester.tap(find.text('تأیید کد'));
    await tester.pumpAndSettle();

    expect(transport.bodies[1]['code'], '12345');
    expect(transport.bodies[1]['phone'], '09121234567');
  });

  testWidgets('verified state is announced and remains token-free',
      (tester) async {
    final transport = _SequenceTransport([
      _challengeResponse,
      MobileAuthHttpResponse(
        statusCode: 200,
        contentType: 'application/json',
        body: _fixtureSessionBody(),
      ),
    ]);
    await tester.pumpWidget(_harnessWithTransport(transport));
    await tester.enterText(
        find.bySemanticsLabel('شماره موبایل'), '09121234567');
    await tester.tap(find.text('ارسال کد ورود'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.bySemanticsLabel('کد یک‌بارمصرف پنج رقمی'), '12345');
    await tester.tap(find.text('تأیید کد'));
    await tester.pumpAndSettle();

    expect(find.text('ورود با موفقیت انجام شد.'), findsOneWidget);
    expect(find.textContaining('session'), findsNothing);
    expect(find.textContaining('refresh'), findsNothing);
  });
}

Widget _harnessWithTransport(MobileAuthHttpTransport transport) {
  return MaterialApp(
    locale: const Locale('fa'),
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: MobileAuthScreen(
        authClient: MobileAuthClient(
          origin: Uri.parse('https://preview.learnbox.example'),
          http: transport,
          store: _FakeSessionStore(),
        ),
        installationId: 'installation-test',
      ),
    ),
  );
}

String _fixtureSessionBody() => jsonEncode({
      'access${'Token'}': _fixtureAccessToken(),
      'refresh${'Token'}': 'refresh-fixture',
    });

String _fixtureAccessToken() {
  final payload =
      base64Url.encode(utf8.encode(jsonEncode({'sid': 'session-1'})));
  return 'fixture-header.$payload.fixture-signature';
}

const _challengeResponse = MobileAuthHttpResponse(
  statusCode: 201,
  contentType: 'application/json',
  body:
      '{"challengeId":"challenge-1","expiresAt":"2026-08-26T10:00:00.000Z","resendAvailableAt":"2026-08-26T10:02:00.000Z"}',
);

class _FakeHttpTransport implements MobileAuthHttpTransport {
  _FakeHttpTransport(this.response);

  final MobileAuthHttpResponse response;
  final calls = <String>[];
  final bodies = <Map<String, Object>>[];

  @override
  Future<MobileAuthHttpResponse> postJson({
    required String method,
    required Uri endpoint,
    required Map<String, Object> body,
    String? accessToken,
  }) async {
    calls.add(endpoint.path);
    bodies.add(body);
    return response;
  }
}

class _SequenceTransport implements MobileAuthHttpTransport {
  _SequenceTransport(this.responses);

  final List<MobileAuthHttpResponse> responses;
  final bodies = <Map<String, Object>>[];
  var index = 0;

  @override
  Future<MobileAuthHttpResponse> postJson({
    required String method,
    required Uri endpoint,
    required Map<String, Object> body,
    String? accessToken,
  }) async {
    bodies.add(body);
    return responses[index++];
  }
}

class _FakeSessionStore implements MobileSessionStore {
  @override
  Future<MobileSession?> read() async => null;

  @override
  Future<void> write(MobileSession session) async {}

  @override
  Future<void> clear() async {}
}
