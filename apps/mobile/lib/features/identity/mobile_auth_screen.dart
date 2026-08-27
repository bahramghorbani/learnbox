import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'mobile_auth_client.dart';
import 'mobile_auth_http_client.dart';
import '../../ui/learnbox_theme.dart';

/// Dormant Persian-first native authentication surface.
///
/// This widget owns only the UI state machine. It is intentionally not wired
/// into [main.dart] or the default application composition.
class MobileAuthScreen extends StatefulWidget {
  const MobileAuthScreen({
    required this.authClient,
    required this.installationId,
    super.key,
  });

  final MobileAuthClient authClient;
  final String installationId;

  @override
  State<MobileAuthScreen> createState() => _MobileAuthScreenState();
}

enum _AuthStep { phone, otp, verified }

class _MobileAuthScreenState extends State<MobileAuthScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  _AuthStep _step = _AuthStep.phone;
  String? _error;
  bool _busy = false;
  String? _challengeId;

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    final phone = _normalizeDigits(_phoneController.text.trim());
    if (!_isValidPhone(phone)) {
      setState(() => _error = 'شماره موبایل را کامل وارد کن.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final challenge = await widget.authClient.requestOtp(phone: phone);
      if (!mounted) return;
      setState(() {
        _challengeId = challenge.challengeId;
        _step = _AuthStep.otp;
        _busy = false;
      });
    } on MobileAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _messageFor(error.code);
      });
    }
  }

  Future<void> _verifyCode() async {
    final code = _normalizeDigits(_otpController.text.trim());
    if (code.length != 5) {
      setState(() => _error = 'کد پنج رقمی را وارد کن.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.authClient.verifyOtp(
        challengeId: _challengeId!,
        code: code,
        installationId: widget.installationId,
        phone: _normalizeDigits(_phoneController.text.trim()),
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _step = _AuthStep.verified;
      });
    } on MobileAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _messageFor(error.code);
      });
    }
  }

  void _changeNumber() {
    setState(() {
      _step = _AuthStep.phone;
      _challengeId = null;
      _otpController.clear();
      _error = null;
      _busy = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
            child: ConstrainedBox(
              constraints:
                  BoxConstraints(minHeight: constraints.maxHeight - 56),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: _buildStep(context),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(BuildContext context) {
    if (_step == _AuthStep.otp) return _buildOtp(context);
    if (_step == _AuthStep.verified) return _buildVerified(context);
    return _buildPhone(context);
  }

  Widget _buildPhone(BuildContext context) {
    return Column(
      key: const ValueKey('phone'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        Text(
          'LearnBox',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: learnBoxPrimary,
              ),
        ),
        const SizedBox(height: 28),
        Text(
          'به LearnBox خوش آمدی',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 10),
        Text(
          'برای ادامه، شمارهٔ موبایل خودت را وارد کن.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
        Directionality(
          textDirection: TextDirection.ltr,
          child: TextField(
            controller: _phoneController,
            enabled: !_busy,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.done,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9۰-۹+]')),
            ],
            decoration: const InputDecoration(
              labelText: 'شماره موبایل',
              hintText: '+98 912 123 4567',
              prefixText: '+98 ',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(18)),
              ),
            ),
            onSubmitted: (_) => _requestCode(),
          ),
        ),
        if (_error != null) _errorText(),
        const SizedBox(height: 18),
        SizedBox(
          height: 56,
          child: FilledButton(
            onPressed: _busy ? null : _requestCode,
            child: Text(_busy ? 'در حال ارسال کد…' : 'ارسال کد ورود'),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'شماره‌ات فقط برای همین تلاش ورود استفاده می‌شود.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: learnBoxMuted,
              ),
        ),
      ],
    );
  }

  Widget _buildOtp(BuildContext context) {
    return Column(
      key: const ValueKey('otp'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: SizedBox(
            height: 48,
            child: TextButton(
              onPressed: _busy ? null : _changeNumber,
              child: const Text('تغییر شماره'),
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'کد پیامک‌شده را وارد کن',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 10),
        Text(
          'کد ارسال‌شده به ${_phoneController.text.trim()} را وارد کن.',
          textAlign: TextAlign.center,
          textDirection: TextDirection.rtl,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
        const SizedBox(height: 28),
        Directionality(
          textDirection: TextDirection.ltr,
          child: TextField(
            controller: _otpController,
            enabled: !_busy,
            autofocus: true,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            maxLength: 5,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9۰-۹]'))
            ],
            decoration: const InputDecoration(
              labelText: 'کد یک‌بارمصرف پنج رقمی',
              counterText: '',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(18)),
              ),
            ),
            onSubmitted: (_) => _verifyCode(),
          ),
        ),
        if (_error != null) _errorText(),
        const SizedBox(height: 18),
        SizedBox(
          height: 56,
          child: FilledButton(
            onPressed: _busy ? null : _verifyCode,
            child: Text(_busy ? 'در حال بررسی…' : 'تأیید کد'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 48,
          child: TextButton(
            onPressed: _busy ? null : _requestCode,
            child: const Text('ارسال دوباره کد'),
          ),
        ),
      ],
    );
  }

  Widget _buildVerified(BuildContext context) {
    return Column(
      key: const ValueKey('verified'),
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'ورود با موفقیت انجام شد.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
      ],
    );
  }

  Widget _errorText() => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Semantics(
          liveRegion: true,
          child: Text(
            _error!,
            textAlign: TextAlign.start,
            style: const TextStyle(color: Color(0xffb3261e)),
          ),
        ),
      );

  static bool _isValidPhone(String phone) =>
      RegExp(r'^09[0-9]{9}$').hasMatch(phone) ||
      RegExp(r'^\+989[0-9]{9}$').hasMatch(phone);

  static String _normalizeDigits(String value) => value
      .replaceAll('۰', '0')
      .replaceAll('۱', '1')
      .replaceAll('۲', '2')
      .replaceAll('۳', '3')
      .replaceAll('۴', '4')
      .replaceAll('۵', '5')
      .replaceAll('۶', '6')
      .replaceAll('۷', '7')
      .replaceAll('۸', '8')
      .replaceAll('۹', '9');

  static String _messageFor(String code) => switch (code) {
        'validation' => 'کد واردشده معتبر نیست. دوباره بررسی کن.',
        'invalidCode' => 'کد واردشده درست نیست. دوباره تلاش کن.',
        'expired' => 'این کد منقضی شده است. یک کد تازه بگیر.',
        'rateLimited' =>
          'درخواست‌های زیادی فرستاده‌ای. کمی بعد دوباره تلاش کن.',
        'offline' => 'اتصال اینترنت در دسترس نیست. اتصال را بررسی کن.',
        'timeout' => 'ارتباط طول کشید. دوباره تلاش کن.',
        'serverUnavailable' => 'فعلاً امکان ارسال کد نیست. دوباره تلاش کن.',
        'authenticationRequired' => 'برای ادامه دوباره وارد شو.',
        _ => 'مشکلی پیش آمد. دوباره تلاش کن.',
      };
}
