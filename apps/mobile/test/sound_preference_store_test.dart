import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/sound_preference_store.dart';

void main() {
  group('SoundPreferenceStore record handling', () {
    test(
        'absent record resolves to the safe default enabled and writes nothing',
        () async {
      final storage = RecordingSoundPreferenceStorage();
      final store = SoundPreferenceStore(storage: storage);

      expect(await store.loadEnabled(), isTrue);
      expect(storage.writeCount, 0);
    });

    test('empty and blank records resolve to enabled without a write',
        () async {
      for (final raw in ['', '   ', '\n']) {
        final storage = RecordingSoundPreferenceStorage(value: raw);
        final store = SoundPreferenceStore(storage: storage);

        expect(await store.loadEnabled(), isTrue);
        expect(storage.writeCount, 0, reason: 'raw: "$raw"');
      }
    });

    test('valid v1 record with sound disabled resolves to disabled', () async {
      final storage = RecordingSoundPreferenceStorage(
        value: jsonEncode({'version': 1, 'enabled': false}),
      );
      final store = SoundPreferenceStore(storage: storage);

      expect(await store.loadEnabled(), isFalse);
      expect(storage.writeCount, 0);
    });

    test('valid v1 record with sound enabled resolves to enabled', () async {
      final storage = RecordingSoundPreferenceStorage(
        value: jsonEncode({'version': 1, 'enabled': true}),
      );
      final store = SoundPreferenceStore(storage: storage);

      expect(await store.loadEnabled(), isTrue);
      expect(storage.writeCount, 0);
    });

    test('corrupt v1 record self-heals to a clean enabled record', () async {
      final storage = RecordingSoundPreferenceStorage(value: '{not json');
      final store = SoundPreferenceStore(storage: storage);

      expect(await store.loadEnabled(), isTrue);
      expect(storage.writeCount, 1);
      expect(
        jsonDecode(storage.value!),
        {'version': 1, 'enabled': true},
      );
    });

    test('wrong-shaped v1 record self-heals without deleting other data',
        () async {
      final storage = RecordingSoundPreferenceStorage(
        value: jsonEncode({'version': 1, 'enabled': 'sometimes'}),
      );
      final store = SoundPreferenceStore(storage: storage);

      expect(await store.loadEnabled(), isTrue);
      expect(storage.writeCount, 1);
      expect(jsonDecode(storage.value!), {'version': 1, 'enabled': true});
    });

    test('unknown newer version defaults to enabled but record stays untouched',
        () async {
      final raw = jsonEncode({'version': 2, 'enabled': false});
      final storage = RecordingSoundPreferenceStorage(value: raw);
      final store = SoundPreferenceStore(storage: storage);

      expect(await store.loadEnabled(), isTrue);
      expect(storage.writeCount, 0);
      expect(storage.value, raw);
    });

    test('self-heal write failure never crashes and keeps the safe default',
        () async {
      final storage = RecordingSoundPreferenceStorage(
        value: '{not json',
        failWrites: true,
      );
      final store = SoundPreferenceStore(storage: storage);

      expect(await store.loadEnabled(), isTrue);
      expect(storage.writeCount, 1);
    });

    test('saveEnabled persists an exact versioned v1 record', () async {
      final storage = RecordingSoundPreferenceStorage();
      final store = SoundPreferenceStore(storage: storage);

      await store.saveEnabled(false);
      expect(jsonDecode(storage.value!), {'version': 1, 'enabled': false});

      await store.saveEnabled(true);
      expect(jsonDecode(storage.value!), {'version': 1, 'enabled': true});
    });
  });

  group('SoundPreferenceController', () {
    test('load failure never crashes and falls back to enabled truthfully',
        () async {
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(
          storage: RecordingSoundPreferenceStorage(failReads: true),
        ),
      );

      await controller.load();

      expect(controller.soundEnabled, isTrue);
      expect(controller.loaded, isTrue);
      expect(controller.loadFailed, isTrue);
    });

    test('successful load reflects the persisted value', () async {
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(
          storage: RecordingSoundPreferenceStorage(
            value: jsonEncode({'version': 1, 'enabled': false}),
          ),
        ),
      );

      await controller.load();

      expect(controller.soundEnabled, isFalse);
      expect(controller.loadFailed, isFalse);
    });

    test('successful save updates the value and notifies once', () async {
      final storage = RecordingSoundPreferenceStorage();
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(storage: storage),
      );
      await controller.load();
      var notifications = 0;
      controller.addListener(() => notifications += 1);

      final saved = await controller.setEnabled(false);

      expect(saved, isTrue);
      expect(controller.soundEnabled, isFalse);
      expect(controller.saveFailed, isFalse);
      expect(notifications, 2); // saving state, then saved state.
      expect(jsonDecode(storage.value!), {'version': 1, 'enabled': false});
    });

    test('failed save reverts: value unchanged, failure surfaced, no crash',
        () async {
      final storage = RecordingSoundPreferenceStorage(failWrites: true);
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(storage: storage),
      );
      await controller.load();

      final saved = await controller.setEnabled(false);

      expect(saved, isFalse);
      expect(controller.soundEnabled, isTrue,
          reason: 'the switch must never move on a failed save');
      expect(controller.saveFailed, isTrue);
      expect(controller.saving, isFalse);
    });

    test('retry after a failed save persists the attempted value', () async {
      final storage = RecordingSoundPreferenceStorage(failWrites: true);
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(storage: storage),
      );
      await controller.load();
      await controller.setEnabled(false);
      expect(controller.saveFailed, isTrue);

      storage.failWrites = false;
      final retried = await controller.retry();

      expect(retried, isTrue);
      expect(controller.soundEnabled, isFalse);
      expect(controller.saveFailed, isFalse);
      expect(jsonDecode(storage.value!), {'version': 1, 'enabled': false});
    });

    test('setting the already-current value is a no-op that clears failure',
        () async {
      final storage = RecordingSoundPreferenceStorage(
        value: jsonEncode({'version': 1, 'enabled': true}),
      );
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(storage: storage),
      );
      await controller.load();
      expect(controller.soundEnabled, isTrue);

      final saved = await controller.setEnabled(true);

      expect(saved, isTrue);
      expect(storage.writeCount, 0);
    });

    test('save that never completes times out, reverts and keeps retry UI',
        () async {
      final storage = HangingSoundPreferenceStorage();
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(storage: storage),
        storageTimeout: const Duration(milliseconds: 50),
      );
      await controller.load();
      expect(controller.soundEnabled, isTrue);

      final saved = await controller.setEnabled(false);

      expect(saved, isFalse, reason: 'unconfirmed write must not report saved');
      expect(controller.soundEnabled, isTrue,
          reason: 'the switch must revert when the write never confirms');
      expect(controller.saveFailed, isTrue,
          reason: 'a hung write must surface as a truthful save failure');
      expect(controller.saving, isFalse,
          reason: 'the in-flight guard must release after the timeout');
    });

    test('load that never completes times out to the read-failure state',
        () async {
      final storage = HangingSoundPreferenceStorage();
      final controller = SoundPreferenceController(
        store: SoundPreferenceStore(storage: storage),
        storageTimeout: const Duration(milliseconds: 50),
      );

      await controller.load();

      expect(controller.loadFailed, isTrue,
          reason: 'a hung read must surface as a truthful read failure');
      expect(controller.soundEnabled, isTrue,
          reason: 'the safe enabled default stays usable');
      expect(controller.loading, isFalse,
          reason: 'loading must end even when the platform never answers');
    });
  });
}

class HangingSoundPreferenceStorage implements SoundPreferenceStorage {
  final Completer<String?> _never = Completer<String?>();

  @override
  Future<String?> read() => _never.future;

  @override
  Future<void> write(String value) => Completer<void>().future;
}

class RecordingSoundPreferenceStorage implements SoundPreferenceStorage {
  RecordingSoundPreferenceStorage({
    this.value,
    this.failReads = false,
    this.failWrites = false,
  });

  String? value;
  bool failReads;
  bool failWrites;
  var readCount = 0;
  var writeCount = 0;

  @override
  Future<String?> read() async {
    readCount += 1;
    if (failReads) {
      throw StateError('synthetic secure storage read failure');
    }
    return value;
  }

  @override
  Future<void> write(String value) async {
    writeCount += 1;
    if (failWrites) {
      throw StateError('synthetic secure storage write failure');
    }
    this.value = value;
  }
}
