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
