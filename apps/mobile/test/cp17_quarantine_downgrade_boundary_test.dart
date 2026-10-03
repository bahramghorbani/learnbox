import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/binary_response.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';

/// CP17 F3 — the quarantine/downgrade boundary.
///
/// A pre-CP16 client's `_load()` requires an envelope of EXACTLY two keys
/// (`decoded.length != 2` -> `_discardCorruptQueue()`), so any extra key makes
/// an older build **delete every queued review**. These tests pin that a queue
/// containing no binary evidence stays readable by that older build.
class _MemoryStore implements ReviewQueueStore {
  _MemoryStore([this.value]);

  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serializedEvents) async {
    value = serializedEvents;
  }
}

/// Faithful reproduction of the pre-CP16 (CP15, b0ce6812) reader contract.
///
/// Returns the number of events an old build would recover; `0` means it hit
/// `_discardCorruptQueue()` and wiped the learner's unsynced reviews.
int legacyRecoverableEventCount(String? serialized) {
  if (serialized == null) return 0;
  try {
    final decoded = jsonDecode(serialized);
    if (decoded is! Map<String, dynamic> ||
        decoded.length != 2 ||
        decoded['schemaVersion'] != 1 ||
        decoded['events'] is! List<dynamic>) {
      return 0;
    }
    return (decoded['events'] as List<dynamic>).length;
  } catch (_) {
    return 0;
  }
}

void main() {
  group('CP17 F3 — quarantine must not cross the downgrade boundary alone', () {
    test('a corrupt entry quarantines itself without stranding valid events',
        () async {
      final store = _MemoryStore(
        jsonEncode({
          'schemaVersion': 1,
          'events': [
            {
              'clientEventId': 'evt-good-1',
              'cardId': 'card-1',
              'grade': 'remembered',
              'occurredAt': '2026-08-24T12:00:00.000Z',
            },
            {'clientEventId': 'evt-bad-1', 'cardId': '', 'grade': 'nope'},
            {
              'clientEventId': 'evt-good-2',
              'cardId': 'card-2',
              'grade': 'forgot',
              'occurredAt': '2026-08-24T12:00:01.000Z',
            },
          ],
        }),
      );
      final queue = ReviewQueue(store: store);

      final events = await queue.pendingEvents();
      expect(events.map((e) => e.clientEventId), ['evt-good-1', 'evt-good-2']);
      expect(await queue.quarantinedEntries(), hasLength(1));
    });

    test(
      'quarantine WITHOUT any binary event keeps the queue readable by a pre-CP16 build',
      () async {
        final store = _MemoryStore(
          jsonEncode({
            'schemaVersion': 1,
            'events': [
              {
                'clientEventId': 'evt-good-1',
                'cardId': 'card-1',
                'grade': 'remembered',
                'occurredAt': '2026-08-24T12:00:00.000Z',
              },
              {'clientEventId': 'evt-bad-1', 'cardId': '', 'grade': 'nope'},
            ],
          }),
        );
        final quarantineStore = _MemoryStore();
        final queue =
            ReviewQueue(store: store, quarantineStore: quarantineStore);
        await queue.pendingEvents();

        // The forensic evidence must survive...
        expect(await queue.quarantinedEntries(), hasLength(1));
        expect(quarantineStore.value, isNotNull);

        // ...but it must NOT be smuggled into the envelope a downgraded build reads.
        expect(
          legacyRecoverableEventCount(store.value),
          1,
          reason: 'a pre-CP16 build must still recover evt-good-1',
        );
      },
    );

    test('an actual binary event DOES cross the boundary, by design', () async {
      final store = _MemoryStore();
      final queue = ReviewQueue(store: store);
      await queue.recordBinary(
        'card-1',
        BinaryResponse.known,
        DateTime.utc(2026, 8, 24, 12),
      );

      // Binary evidence genuinely cannot be represented to an old build, so the
      // envelope legitimately moves to v2 and the boundary is crossed.
      expect(legacyRecoverableEventCount(store.value), 0);
      final decoded = jsonDecode(store.value!) as Map<String, dynamic>;
      expect(decoded['schemaVersion'], 2);
    });

    test('quarantine survives a reload and is still not in the legacy envelope',
        () async {
      final store = _MemoryStore(
        jsonEncode({
          'schemaVersion': 1,
          'events': [
            {'clientEventId': 'evt-bad-1', 'cardId': '', 'grade': 'nope'},
          ],
        }),
      );
      final quarantineStore = _MemoryStore();
      await ReviewQueue(store: store, quarantineStore: quarantineStore)
          .pendingEvents();

      final reloaded =
          ReviewQueue(store: store, quarantineStore: quarantineStore);
      expect(await reloaded.quarantinedEntries(), hasLength(1));
      // Zero events, but still a legally-shaped v1 envelope for an old build.
      expect(legacyRecoverableEventCount(store.value), 0);
      final decoded = jsonDecode(store.value!) as Map<String, dynamic>;
      expect(decoded['schemaVersion'], 1);
      expect(decoded.containsKey('quarantine'), isFalse);
      expect(decoded.keys, hasLength(2));
    });

    test('evidence a CP16 build wrote INTO the envelope is migrated out of it',
        () async {
      // Forward migration: an existing CP16-era queue already carries `quarantine`
      // inside the envelope. Loading it must preserve the evidence and leave the
      // envelope downgrade-readable again.
      final store = _MemoryStore(
        jsonEncode({
          'schemaVersion': 2,
          'events': [
            {
              'clientEventId': 'evt-good-1',
              'cardId': 'card-1',
              'grade': 'remembered',
              'occurredAt': '2026-08-24T12:00:00.000Z',
            },
          ],
          'quarantine': ['{"legacy":"evidence"}'],
        }),
      );
      final quarantineStore = _MemoryStore();
      final queue = ReviewQueue(store: store, quarantineStore: quarantineStore);

      expect((await queue.pendingEvents()).single.clientEventId, 'evt-good-1');
      expect(
          await queue.quarantinedEntries(), contains('{"legacy":"evidence"}'));
      // The envelope is now v1 and 2-key, so a downgraded build recovers the event.
      expect(legacyRecoverableEventCount(store.value), 1);
      expect(
          jsonDecode(store.value!),
          isA<Map<String, dynamic>>().having(
            (m) => m.containsKey('quarantine'),
            'retains no in-envelope quarantine',
            isFalse,
          ));
    });
  });
}
