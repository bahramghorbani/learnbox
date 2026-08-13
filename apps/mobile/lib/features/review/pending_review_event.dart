import 'review_grade.dart';

class PendingReviewEvent {
  const PendingReviewEvent({
    required this.clientEventId,
    required this.cardId,
    required this.grade,
    required this.occurredAt,
  });

  final String clientEventId;
  final String cardId;
  final ReviewGrade grade;
  final DateTime occurredAt;

  Map<String, Object> toJson() => {
        'clientEventId': clientEventId,
        'cardId': cardId,
        'grade': grade.name,
        'occurredAt': occurredAt.toUtc().toIso8601String(),
      };

  static PendingReviewEvent? fromJson(Object? value) {
    if (value is! Map<String, dynamic> ||
        value.length != 4 ||
        !value.containsKey('clientEventId') ||
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

    return PendingReviewEvent(
      clientEventId: clientEventId,
      cardId: cardId,
      grade: grade,
      occurredAt: occurredAt,
    );
  }
}
