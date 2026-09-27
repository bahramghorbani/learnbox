import 'package:learnbox/features/review/sound_preference_store.dart';

/// Hermetic in-memory [SoundPreferenceStorage] for widget tests that mount the
/// full [LearnBoxApp]. A real secure-storage read never completes under the
/// widget-test fake-async clock, so the controller's storage-timeout timer
/// stays pending and trips the teardown `!timersPending` invariant; every
/// full-app test helper must inject this (or an equivalent) instead.
class InMemorySoundPreferenceStorage implements SoundPreferenceStorage {
  InMemorySoundPreferenceStorage({this.value});

  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String value) async {
    this.value = value;
  }
}
