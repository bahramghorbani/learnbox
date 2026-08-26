class MobilePreviewAuthConfig {
  MobilePreviewAuthConfig._(this._approvedOrigin, this._origin);

  static const _originDefine = String.fromEnvironment(
    'LEARNBOX_MOBILE_PREVIEW_ORIGIN',
  );
  static const _verifyDefine = String.fromEnvironment(
    'LEARNBOX_MOBILE_PREVIEW_VERIFY_ENABLED',
  );

  factory MobilePreviewAuthConfig.fromCompileTime({
    required String approvedOrigin,
  }) {
    return MobilePreviewAuthConfig.fromValues(
      origin: _originDefine,
      verifyEnabled: _verifyDefine,
      approvedOrigin: approvedOrigin,
    );
  }

  factory MobilePreviewAuthConfig.fromValues({
    required String origin,
    required String verifyEnabled,
    required String approvedOrigin,
  }) {
    final candidate = origin.trim();
    final approved = approvedOrigin.trim();
    if (verifyEnabled != 'true' ||
        candidate.isEmpty ||
        !_isSafeOrigin(candidate) ||
        candidate != approved) {
      return MobilePreviewAuthConfig._(approved, null);
    }
    return MobilePreviewAuthConfig._(approved, Uri.parse(candidate));
  }

  final String _approvedOrigin;
  final Uri? _origin;

  bool get enabled => _origin != null && _approvedOrigin == _origin.toString();

  Uri? get origin => enabled ? _origin : null;

  static bool _isSafeOrigin(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasPort ||
        uri.path.isNotEmpty && uri.path != '/' ||
        uri.hasQuery ||
        uri.hasFragment) {
      return false;
    }
    return true;
  }
}
