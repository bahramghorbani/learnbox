import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/sync/reconciliation_cursor_store.dart';

void main() {
  group('ReconciliationCursorStore', () {
    test('treats a null stored cursor as absent', () async {
      final store = _MemoryReconciliationCursorStore(null);

      expect(await store.read(), isNull);
    });

    test('round-trips a valid cursor', () async {
      final store = _MemoryReconciliationCursorStore(null);

      await store.write('42');
      expect(await store.read(), '42');
    });

    for (final invalid in <String?>[
      '',
      '  ',
      ' 7',
      '7 ',
      '-1',
      '+1',
      '1.5',
      '1e3',
      '0x10',
      'abc',
      '١٢٣',
    ]) {
      test('fails closed for stored cursor $invalid', () async {
        final store = _MemoryReconciliationCursorStore(invalid);

        expect(await store.read(), isNull);
      });
    }

    test('does not clear the stored value on a failed write', () async {
      final store = _MemoryReconciliationCursorStore('3')..failWrites = true;

      await expectLater(store.write('4'), throwsStateError);
      expect(await store.read(), '3');
    });
  });

  group('compareReconciliationCursors', () {
    test('orders valid cursors numerically, not lexicographically', () {
      expect(compareReconciliationCursors('9', '10'), lessThan(0));
      expect(compareReconciliationCursors('10', '9'), greaterThan(0));
      expect(compareReconciliationCursors('100', '99'), greaterThan(0));
      expect(compareReconciliationCursors('42', '42'), 0);
      expect(compareReconciliationCursors('0', '0'), 0);
      expect(compareReconciliationCursors('007', '7'), 0);
      expect(compareReconciliationCursors('0', '1'), lessThan(0));
    });

    test('handles cursors beyond the 64-bit integer range', () {
      expect(
        compareReconciliationCursors(
            '9223372036854775808', '9223372036854775807'),
        greaterThan(0),
      );
    });
  });
}

class _MemoryReconciliationCursorStore implements ReconciliationCursorStore {
  _MemoryReconciliationCursorStore(this.value);

  String? value;
  var failWrites = false;

  @override
  Future<String?> read() async => parseReconciliationCursor(value);

  @override
  Future<void> write(String cursor) async {
    if (failWrites) {
      throw StateError('Cursor storage unavailable.');
    }
    value = cursor;
  }
}
