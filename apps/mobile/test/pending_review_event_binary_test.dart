import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/binary_response.dart';
import 'package:learnbox/features/review/pending_review_event.dart';
import 'package:learnbox/features/review/review_grade.dart';

/// CP16 Stage 2 — B-2 wire shape and the legacy/binary distinction.
///
/// These tests exist to be *killed* by the mutants listed in the CP16 evidence:
/// collapsing `response == null` into a default, inferring a response from a
/// grade, emitting `cardId` on the wire, or emitting grade+response together.
void main() {
  final occurredAt = DateTime.utc(2026, 10, 3, 9);

  group('legacy four-grade events', () {
    final legacy = PendingReviewEvent(
      clientEventId: 'legacy-1',
      cardId: 'start-a1-haus',
      grade: ReviewGrade.hard,
      occurredAt: occurredAt,
    );

    test('carry no explicit binary response', () {
      expect(legacy.response, isNull);
      expect(legacy.hasExplicitBinaryResponse, isFalse);
    });

    test('never acquire a response key in storage', () {
      expect(legacy.toJson().containsKey('response'), isFalse);
    });

    test('go on the wire as contentId + grade, never cardId, never response',
        () {
      expect(legacy.toWireJson(), {
        'clientEventId': 'legacy-1',
        'contentId': 'start-a1-haus',
        'grade': 'hard',
        'occurredAt': '2026-10-03T09:00:00.000Z',
      });
    });

    test('round-trip through storage stays legacy', () {
      final restored = PendingReviewEvent.fromJson(legacy.toJson());
      expect(restored, isNotNull);
      expect(restored!.response, isNull);
      expect(restored.grade, ReviewGrade.hard);
    });
  });

  group('explicit binary events', () {
    test('known maps to the remembered shadow grade', () {
      final event = PendingReviewEvent.binary(
        clientEventId: 'b-1',
        cardId: 'start-a1-haus',
        response: BinaryResponse.known,
        occurredAt: occurredAt,
      );
      expect(event.response, BinaryResponse.known);
      expect(event.grade, ReviewGrade.remembered);
    });

    test('unknown maps to the forgot shadow grade', () {
      final event = PendingReviewEvent.binary(
        clientEventId: 'b-2',
        cardId: 'start-a1-haus',
        response: BinaryResponse.unknown,
        occurredAt: occurredAt,
      );
      expect(event.response, BinaryResponse.unknown);
      expect(event.grade, ReviewGrade.forgot);
    });

    test('send response INSTEAD of grade on the wire (never both)', () {
      final wire = PendingReviewEvent.binary(
        clientEventId: 'b-3',
        cardId: 'start-a1-haus',
        response: BinaryResponse.known,
        occurredAt: occurredAt,
      ).toWireJson();

      expect(wire['response'], 'known');
      expect(wire.containsKey('grade'), isFalse,
          reason: 'grade + response together is rejected as ambiguous');
      expect(wire.containsKey('cardId'), isFalse);
      expect(wire['contentId'], 'start-a1-haus');
    });

    test('keep the shadow grade in storage for downgrade safety', () {
      final stored = PendingReviewEvent.binary(
        clientEventId: 'b-4',
        cardId: 'start-a1-haus',
        response: BinaryResponse.unknown,
        occurredAt: occurredAt,
      ).toJson();

      // An older build reads 'grade' and ignores 'response'.
      expect(stored['grade'], 'forgot');
      expect(stored['response'], 'unknown');
    });

    test('round-trip preserves the explicit response', () {
      final original = PendingReviewEvent.binary(
        clientEventId: 'b-5',
        cardId: 'start-a1-haus',
        response: BinaryResponse.known,
        occurredAt: occurredAt,
      );
      final restored = PendingReviewEvent.fromJson(original.toJson());
      expect(restored!.response, BinaryResponse.known);
      expect(restored.hasExplicitBinaryResponse, isTrue);
    });
  });

  group('parsing distinguishes absence from explicit evidence', () {
    Map<String, dynamic> base() => {
          'clientEventId': 'e-1',
          'cardId': 'start-a1-haus',
          'grade': 'hard',
          'occurredAt': '2026-10-03T09:00:00.000Z',
        };

    test('absent response => legacy, not a defaulted value', () {
      expect(PendingReviewEvent.fromJson(base())!.response, isNull);
    });

    test('an unreadable response is corruption, NOT a silent downgrade', () {
      // Accepting this as legacy would fabricate history: the learner did
      // answer in binary, we simply cannot read it.
      expect(
        PendingReviewEvent.fromJson(base()..['response'] = 'nonsense'),
        isNull,
      );
      expect(PendingReviewEvent.fromJson(base()..['response'] = 7), isNull);
    });

    test('unknown fields are tolerated (forward compatibility)', () {
      final restored = PendingReviewEvent.fromJson(
        base()
          ..['futureField'] = {'nested': true}
          ..['anotherOne'] = 42,
      );
      expect(restored, isNotNull);
      expect(restored!.clientEventId, 'e-1');
    });

    test('a missing required key is still rejected', () {
      final missing = base()..remove('cardId');
      expect(PendingReviewEvent.fromJson(missing), isNull);
    });
  });
}
