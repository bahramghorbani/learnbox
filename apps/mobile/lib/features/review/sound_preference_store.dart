import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Device-local sound preference storage boundary (M3-S1). The record is a
/// single versioned JSON document under its own dedicated secure-storage key:
/// `{"version":1,"enabled":true|false}`. Absent records and corrupt v1 data
/// resolve to the safe default (sound enabled); corrupt v1 data self-heals by
/// rewriting its own key only; unknown newer versions resolve to enabled and
/// are never modified. Storage failures never crash callers: the store
/// rethrows so the [SoundPreferenceController] can surface a truthful
/// load/save status and revert instead of moving a switch that did not save.
abstract interface class SoundPreferenceStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class SecureSoundPreferenceStorage implements SoundPreferenceStorage {
  SecureSoundPreferenceStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                resetOnError: false,
                migrateOnAlgorithmChange: true,
                migrateWithBackup: true,
                storageNamespace: storageNamespace,
              ),
            );

  static const storageKey = 'learnbox.soundPreference.v1';
  static const storageNamespace = 'learnbox.soundPreference.v1';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: storageKey);

  @override
  Future<void> write(String value) =>
      _storage.write(key: storageKey, value: value);
}

const soundPreferenceRecordVersion = 1;

class SoundPreferenceStore {
  SoundPreferenceStore({required SoundPreferenceStorage storage})
      : _storage = storage;

  final SoundPreferenceStorage _storage;

  /// Resolves the effective preference with default-on compatibility.
  ///
  /// - No record or a blank record: enabled, nothing written.
  /// - Valid v1 record: its persisted value.
  /// - Corrupt v1 record: enabled and the own key is rewritten to a clean
  ///   `{"version":1,"enabled":true}` record (best effort; a failed heal
  ///   write is swallowed so a broken write never crashes or hides the safe
  ///   default).
  /// - Unknown newer version: enabled, record left untouched.
  /// - Storage read failure: rethrown for the controller to surface.
  Future<bool> loadEnabled() async {
    final raw = await _storage.read();
    if (raw == null || raw.trim().isEmpty) return true;

    final version = _recordVersion(raw);
    if (version == soundPreferenceRecordVersion) {
      final enabled = _v1Enabled(raw);
      if (enabled != null) return enabled;
      // Corrupt v1 data: self-heal this dedicated key to the safe default.
      try {
        await _storage.write(_encodeRecord(true));
      } catch (_) {
        // Best-effort heal only; the default remains usable.
      }
      return true;
    }
    if (version != null && version > soundPreferenceRecordVersion) {
      // Unknown newer schema: never touch a record this build cannot parse.
      return true;
    }
    // Corrupt v1 data (unparseable or version-less): self-heal.
    try {
      await _storage.write(_encodeRecord(true));
    } catch (_) {
      // Best-effort heal only; the default remains usable.
    }
    return true;
  }

  /// Persists an explicit user choice as a v1 record. Throws on storage
  /// failure so the controller can revert and offer retry.
  Future<void> saveEnabled(bool enabled) =>
      _storage.write(_encodeRecord(enabled));

  int? _recordVersion(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        final version = decoded['version'];
        if (version is int) return version;
      }
    } on FormatException {
      // Fall through to corrupt handling.
    }
    return null;
  }

  bool? _v1Enabled(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic> && decoded['enabled'] is bool) {
        return decoded['enabled'] as bool;
      }
    } on FormatException {
      // Fall through to corrupt handling.
    }
    return null;
  }

  String _encodeRecord(bool enabled) =>
      jsonEncode({'version': soundPreferenceRecordVersion, 'enabled': enabled});
}

/// UI truth for the sound preference. Defaults to enabled, follows the
/// persisted record on [load], and never moves ahead of a confirmed save:
/// a failed save leaves [soundEnabled] unchanged and sets [saveFailed] so the
/// Settings surface can revert visibly and offer [retry].
class SoundPreferenceController extends ChangeNotifier {
  SoundPreferenceController({
    required SoundPreferenceStore store,
    this.storageTimeout = const Duration(seconds: 5),
  }) : _store = store;

  final SoundPreferenceStore _store;

  /// Bounds every storage operation so a platform write/read that never
  /// completes (e.g. a blocked keystore) still surfaces as a truthful
  /// load/save failure instead of leaving the UI stuck mid-operation.
  final Duration storageTimeout;

  bool soundEnabled = true;
  bool loaded = false;
  bool loading = true;
  bool loadFailed = false;
  bool saving = false;
  bool saveFailed = false;
  bool? lastSaveSucceeded;
  bool? _lastAttemptedSave;
  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() async {
    loading = true;
    loadFailed = false;
    saveFailed = false;
    lastSaveSucceeded = null;
    _notify();
    try {
      soundEnabled = await _store.loadEnabled().timeout(storageTimeout);
    } catch (_) {
      // Storage read failure never crashes: keep the safe enabled default and
      // surface a truthful read status with retry in Settings.
      loadFailed = true;
    }
    loading = false;
    loaded = true;
    _notify();
  }

  /// Saves a user choice. Returns true only after the store confirmed the
  /// write; on failure the current [soundEnabled] is unchanged and the
  /// attempted value is remembered for [retry].
  Future<bool> setEnabled(bool enabled) async {
    if (saving) return false;
    if (enabled == soundEnabled && !saveFailed) return true;
    _lastAttemptedSave = enabled;
    saving = true;
    saveFailed = false;
    lastSaveSucceeded = null;
    _notify();
    try {
      await _store.saveEnabled(enabled).timeout(storageTimeout);
      soundEnabled = enabled;
      saving = false;
      lastSaveSucceeded = true;
      _notify();
      return true;
    } catch (_) {
      saving = false;
      saveFailed = true;
      lastSaveSucceeded = false;
      _notify();
      return false;
    }
  }

  /// Re-attempts the last failed save (retry UX for save errors).
  Future<bool> retry() async {
    final attempted = _lastAttemptedSave;
    if (attempted == null || !saveFailed) return true;
    return setEnabled(attempted);
  }

  /// Re-attempts loading after a read failure.
  Future<void> retryLoad() => load();
}

/// Inherited scope exposing the app-level sound preference controller to
/// Settings and Review routes (registered above the Navigator through
/// `MaterialApp.builder` so pushed routes can depend on it).
class SoundPreferenceScope
    extends InheritedNotifier<SoundPreferenceController> {
  const SoundPreferenceScope({
    super.key,
    required SoundPreferenceController controller,
    required super.child,
  }) : super(notifier: controller);

  static SoundPreferenceController? maybeOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<SoundPreferenceScope>()
      ?.notifier;
}
