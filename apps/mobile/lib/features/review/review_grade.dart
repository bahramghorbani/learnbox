enum ReviewGrade {
  forgot,
  hard,
  remembered,
  mastered;

  static ReviewGrade? fromSerialized(String value) {
    for (final grade in values) {
      if (grade.name == value) {
        return grade;
      }
    }
    return null;
  }
}
