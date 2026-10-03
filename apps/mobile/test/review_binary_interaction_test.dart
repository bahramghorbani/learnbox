@TestOn('vm')
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/binary_response.dart';
import 'package:learnbox/features/review/binary_review_ui_config.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_grade.dart';
import 'package:learnbox/features/review/review_queue_store.dart';

/// CP16 Stage 3 — the binary interaction records explicit binary evidence.
///
/// The widget itself is gated by a compile-time define, so these tests drive the
/// queue path the binary buttons call. The widget-level gate is covered by
/// [BinaryReviewUiConfig] defaulting off, asserted below.
void main() {
  test('the binary UI gate is OFF by default (four grades unless opted in)',
      () {
    // No --dart-define in the test run, so a build that forgets the define keeps
    // the historical interaction rather than silently switching learners over.
    expect(BinaryReviewUiConfig.enabled, isFalse);
  });

  test('known is stored as explicit evidence with the remembered shadow',
      () async {
    final store = InMemoryReviewQueueStore();
    final queue = ReviewQueue(store: store, idFactory: () => 'bin-known');

    await queue.recordBinary(
      'start-a1-haus',
      BinaryResponse.known,
      DateTime.utc(2026, 10, 3, 9),
    );

    final event = (await queue.pendingEvents()).single;
    expect(event.response, BinaryResponse.known);
    expect(event.grade.name, 'remembered');
    expect(event.hasExplicitBinaryResponse, isTrue);
  });

  test('unknown is stored as explicit evidence with the forgot shadow',
      () async {
    final store = InMemoryReviewQueueStore();
    final queue = ReviewQueue(store: store, idFactory: () => 'bin-unknown');

    await queue.recordBinary(
      'start-a1-haus',
      BinaryResponse.unknown,
      DateTime.utc(2026, 10, 3, 9),
    );

    final event = (await queue.pendingEvents()).single;
    expect(event.response, BinaryResponse.unknown);
    expect(event.grade.name, 'forgot');
  });

  test('a four-grade record never acquires a binary response', () async {
    final store = InMemoryReviewQueueStore();
    final queue = ReviewQueue(store: store, idFactory: () => 'legacy-1');

    await queue.record(
      'start-a1-haus',
      ReviewGrade.remembered,
      DateTime.utc(2026, 10, 3, 9),
    );

    final event = (await queue.pendingEvents()).single;
    expect(event.response, isNull,
        reason: 'a grade must never be inferred into explicit binary evidence');
  });

  test('binary and legacy events coexist in one queue, each self-describing',
      () async {
    final store = InMemoryReviewQueueStore();
    var n = 0;
    final queue = ReviewQueue(store: store, idFactory: () => 'id-${n++}');

    await queue.record(
      'start-a1-haus',
      ReviewGrade.hard,
      DateTime.utc(2026, 10, 3, 9),
    );
    await queue.recordBinary(
      'start-a1-tisch',
      BinaryResponse.known,
      DateTime.utc(2026, 10, 3, 10),
    );

    final events = await queue.pendingEvents();
    expect(events.map((e) => e.response), [null, BinaryResponse.known]);

    // And they stay distinguishable across an app restart.
    final restored = await ReviewQueue(store: store).pendingEvents();
    expect(restored.map((e) => e.response), [null, BinaryResponse.known]);
  });

  test('binary wire items carry response and omit grade', () async {
    final event = PendingReviewEvent.binary(
      clientEventId: 'w-1',
      cardId: 'start-a1-haus',
      response: BinaryResponse.unknown,
      occurredAt: DateTime.utc(2026, 10, 3, 9),
    );

    expect(event.toWireJson(), {
      'clientEventId': 'w-1',
      'contentId': 'start-a1-haus',
      'response': 'unknown',
      'occurredAt': '2026-10-03T09:00:00.000Z',
    });
  });
}

class InMemoryReviewQueueStore implements ReviewQueueStore {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String serializedEvents) async {
    value = serializedEvents;
  }
}
