import 'binary_response.dart';
import 'review_grade.dart';

/// A review the learner has answered but the server has not yet acknowledged.
///
/// ## Forward compatibility (CP16 B-3)
///
/// [fromJson] deliberately does **not** check the key count. A queue written by a
/// newer build may carry fields this build does not understand; dropping the whole
/// event — or, worse, the whole queue — would destroy answers the learner already
/// gave. Unknown keys are ignored and the event is still restored, so a newer
/// queue remains readable after a downgrade as long as the required keys are intact.
///
/// ## Binary evidence (CP16 B-2 / Decision A)
///
/// [response] is the per-event discriminator, and **absence is meaningful**:
///
/// * `response == null` — a legacy four-grade event. The learner never expressed a
///   binary intent, so none may be inferred. Serialized without a `response` key,
///   which makes the server store `review_events.response = NULL`.
/// * `response != null` — the learner explicitly chose known/unknown. [grade] then
///   holds the compatibility shadow grade only.
///
/// Projecting a legacy grade into a response is a **read-time** concern on the
/// server and must never be persisted here.
class PendingReviewEvent {
  const PendingReviewEvent({
    required this.clientEventId,
    required this.cardId,
    required this.grade,
    required this.occurredAt,
    this.response,
  });

  /// A review the learner answered with the binary interaction.
  ///
  /// The shadow grade is derived, never passed in, so the two can never disagree.
  PendingReviewEvent.binary({
    required this.clientEventId,
    required this.cardId,
    required BinaryResponse this.response,
    required this.occurredAt,
  }) : grade = response.shadowGrade;

  final String clientEventId;
  final String cardId;
  final ReviewGrade grade;
  final DateTime occurredAt;

  /// Explicit binary answer, or `null` for a legacy four-grade event.
  final BinaryResponse? response;

  /// True when the learner explicitly answered known/unknown.
  bool get hasExplicitBinaryResponse => response != null;

  Map<String, Object> toJson() => {
        'clientEventId': clientEventId,
        'cardId': cardId,
        'grade': grade.name,
        'occurredAt': occurredAt.toUtc().toIso8601String(),
        // Omitted entirely when absent: a legacy event must not gain the key.
        if (response != null) 'response': response!.name,
      };

  /// Server wire shape, which is deliberately **not** the on-device storage shape.
  ///
  /// Two differences, both load-bearing:
  ///
  /// * the server's field is `contentId`, not `cardId` (CP16 B-2 — sending
  ///   `cardId` is rejected with `validation` and retried forever);
  /// * `grade` and `response` are mutually exclusive on the wire. The server
  ///   rejects an item carrying both as ambiguous, and derives the shadow grade
  ///   itself for a binary item.
  ///
  /// Storage keeps `cardId` + shadow `grade` so an older build can still read the
  /// queue after a downgrade.
  Map<String, Object> toWireJson() => {
        'clientEventId': clientEventId,
        'contentId': cardId,
        if (response != null)
          'response': response!.name
        else
          'grade': grade.name,
        'occurredAt': occurredAt.toUtc().toIso8601String(),
      };

  static PendingReviewEvent? fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      return null;
    }
    // Required keys only. Unknown keys are tolerated on purpose: see the class doc.
    if (!value.containsKey('clientEventId') ||
        !value.containsKey('cardId') ||
        !value.containsKey('grade') ||
        !value.containsKey('occurredAt')) {
      return null;
    }

    final clientEventId = value['clientEventId'];
    final cardId = value['cardId'];
    final serializedGrade = value['grade'];
    final serializedOccurredAt = value['occurredAt'];
    if (clientEventId is! String ||
        clientEventId.trim().isEmpty ||
        cardId is! String ||
        cardId.trim().isEmpty ||
        serializedGrade is! String ||
        serializedOccurredAt is! String) {
      return null;
    }

    final grade = ReviewGrade.fromSerialized(serializedGrade);
    final occurredAt = DateTime.tryParse(serializedOccurredAt);
    if (grade == null ||
        occurredAt == null ||
        !occurredAt.isUtc ||
        occurredAt.toIso8601String() != serializedOccurredAt) {
      return null;
    }

    // Absence => legacy. A present but unreadable response is a corrupt event,
    // NOT a legacy one: silently downgrading it would fabricate history.
    BinaryResponse? response;
    if (value.containsKey('response')) {
      final serializedResponse = value['response'];
      if (serializedResponse is! String) {
        return null;
      }
      response = BinaryResponse.fromSerialized(serializedResponse);
      if (response == null) {
        return null;
      }
    }

    return PendingReviewEvent(
      clientEventId: clientEventId,
      cardId: cardId,
      grade: grade,
      occurredAt: occurredAt,
      response: response,
    );
  }
}
