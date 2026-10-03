// Emits the EXACT bytes the real CP16 queue writes for each downgrade category,
// so the downgrade characterization runs against a real producer rather than a
// hand-written guess. Run via: flutter test test/cp16_downgrade_fixture_test.dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/binary_response.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';

class _MemStore implements ReviewQueueStore {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serialized) async => value = serialized;
}

void main() {
  const at = '2026-08-13T09:00:00.000Z';

  Future<String> capture(
    Future<void> Function(ReviewQueue queue) actions, {
    String? seed,
  }) async {
    final store = _MemStore()..value = seed;
    var n = 0;
    final queue = ReviewQueue(
      store: store,
      idFactory: () => 'evt-${++n}',
    );
    await actions(queue);
    return store.value ?? '';
  }

  test('emit CP16 downgrade fixture from the REAL queue', () async {
    final fixture = <String, String>{};

    // A. Code rollback before any binary review is created: the capable build
    //    is installed but only four-grade reviews were ever recorded.
    fixture['A_capable_build_no_binary_review_taken'] = await capture(
      (q) async {
        await q.record('c1', ReviewGrade.hard, DateTime.parse(at));
      },
    );

    // B. Downgrade with an empty/synced queue.
    fixture['B_empty_or_fully_synced_queue'] = await capture((q) async {
      await q.record('c1', ReviewGrade.hard, DateTime.parse(at));
      await q.acknowledge(['evt-1']);
    });

    // C. Downgrade with a pending legacy-only queue.
    fixture['C_pending_legacy_only_queue'] = await capture((q) async {
      await q.record('c1', ReviewGrade.forgot, DateTime.parse(at));
      await q.record('c2', ReviewGrade.mastered, DateTime.parse(at));
    });

    // D. Downgrade after binary queue state exists.
    fixture['D_binary_queue_state_exists'] = await capture((q) async {
      await q.record('c1', ReviewGrade.hard, DateTime.parse(at));
      await q.recordBinary('c2', BinaryResponse.known, DateTime.parse(at));
    });

    // E. Pending legacy-only, but something was quarantined earlier.
    fixture['E_legacy_pending_with_quarantine'] = await capture(
      (q) async {
        await q.pendingCount();
        await q.record('c9', ReviewGrade.hard, DateTime.parse(at));
      },
      seed: jsonEncode({
        'schemaVersion': 1,
        'events': [
          {
            'clientEventId': 'bad',
            'cardId': 'c1',
            'grade': 'nope',
            'occurredAt': at
          },
        ],
      }),
    );

    File('test/fixtures/cp16_downgrade_queue_states.json')
        .writeAsStringSync(const JsonEncoder.withIndent('  ').convert(fixture));

    for (final entry in fixture.entries) {
      expect(entry.value, isNotEmpty, reason: entry.key);
    }
  });
}
