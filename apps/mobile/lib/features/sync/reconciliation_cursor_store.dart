/// Durable per-learner reconciliation cursor persistence (ADR 0014).
///
/// The cursor is an authoritative server projection version expressed as a
/// non-negative decimal string, never a Dart double or JS number.
abstract interface class ReconciliationCursorStore {
  /// Returns the stored cursor, or null when absent.
  ///
  /// Implementations must fail closed: an invalid stored value is returned as
  /// null (see [parseReconciliationCursor]).
  Future<String?> read();

  /// Persists [cursor], which must already be a valid non-negative decimal
  /// string (see [parseReconciliationCursor]).
  Future<void> write(String cursor);
}

/// Returns [value] when it is a non-empty non-negative decimal string of ASCII
/// digits only (no sign, whitespace, decimal point, exponent or non-ASCII
/// digits); otherwise null.
String? parseReconciliationCursor(Object? value) {
  if (value is! String || value.isEmpty) {
    return null;
  }
  for (final codeUnit in value.codeUnits) {
    if (codeUnit < 0x30 || codeUnit > 0x39) {
      return null;
    }
  }
  return value;
}

/// Numerically compares two cursors that already satisfy
/// [parseReconciliationCursor].
///
/// Returns a negative number when [a] is older/smaller, zero when the cursors
/// are equal and a positive number when [a] is newer/greater. The comparison is
/// digit-wise so it stays exact beyond the Dart/JS integer range; cursors must
/// therefore never be parsed into an `int`.
int compareReconciliationCursors(String a, String b) {
  final left = _withoutLeadingZeros(a);
  final right = _withoutLeadingZeros(b);
  if (left.length != right.length) {
    return left.length < right.length ? -1 : 1;
  }
  return left.compareTo(right);
}

String _withoutLeadingZeros(String value) {
  var start = 0;
  while (start < value.length - 1 && value.codeUnitAt(start) == 0x30) {
    start += 1;
  }
  return value.substring(start);
}
