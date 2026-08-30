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
