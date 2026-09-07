import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/features/review/personal_vocabulary_store.dart';

void main() {
  test('personal vocabulary round-trips typed entries', () async {
    final storage = _MemoryStorage();
    final store = PersonalVocabularyStore(storage: storage);
    const entries = [
      PersonalVocabularyEntry(
        id: 'personal-1',
        german: 'der Apfel',
        persian: 'سیب',
      ),
    ];

    await store.save(entries);

    expect(await store.load(), entries);
    expect(storage.deleted, isFalse);
  });

  test('malformed stored entries fail closed without rewriting storage',
      () async {
    final storage = _MemoryStorage(
      initial:
          '[{"id":"ok","german":"das Buch","persian":"کتاب"},{"id":7,"german":null},{"unexpected":true}]',
    );
    final store = PersonalVocabularyStore(storage: storage);

    await expectLater(store.load(), throwsA(isA<FormatException>()));
    expect(storage.writes, 0);
  });

  test('malformed top-level storage fails closed', () async {
    final store = PersonalVocabularyStore(
      storage: _MemoryStorage(initial: '{not-json'),
    );

    await expectLater(store.load(), throwsA(isA<FormatException>()));
  });

  test('store rejects a 31st record before persistence', () async {
    final storage = _MemoryStorage();
    final store = PersonalVocabularyStore(storage: storage);
    final entries = List.generate(
      31,
      (index) => PersonalVocabularyEntry(
        id: 'personal-$index',
        german: 'Wort $index',
        persian: 'واژه $index',
      ),
    );

    await expectLater(store.save(entries), throwsA(isA<FormatException>()));
    expect(storage.writes, 0);
  });

  test('store rejects an oversized persisted payload on load', () async {
    final entries = List.generate(
      31,
      (index) =>
          '{"id":"personal-$index","german":"Wort $index","persian":"واژه $index"}',
    ).join(',');
    final store = PersonalVocabularyStore(
      storage: _MemoryStorage(initial: '[$entries]'),
    );

    await expectLater(store.load(), throwsA(isA<FormatException>()));
  });

  test('store rejects duplicate ids and normalized German values', () async {
    final duplicateId = PersonalVocabularyStore(
      storage: _MemoryStorage(
        initial:
            '[{"id":"same","german":"eins","persian":"یک"},{"id":"same","german":"zwei","persian":"دو"}]',
      ),
    );
    final duplicateGerman = PersonalVocabularyStore(
      storage: _MemoryStorage(
        initial:
            '[{"id":"one","german":"für","persian":"برای"},{"id":"two","german":"für","persian":"جهت"}]',
      ),
    );

    await expectLater(duplicateId.load(), throwsA(isA<FormatException>()));
    await expectLater(duplicateGerman.load(), throwsA(isA<FormatException>()));
  });

  test('saving an empty list deletes the storage key', () async {
    final storage = _MemoryStorage(initial: '[]');
    final store = PersonalVocabularyStore(storage: storage);

    await store.save(const []);

    expect(storage.deleted, isTrue);
    expect(storage.value, isNull);
  });

  test('German normalization trims collapses whitespace and lowercases', () {
    expect(normalizePersonalGerman('  DAS   Haus  '), 'das haus');
  });

  test('German normalization folds canonical combining forms', () {
    expect(normalizePersonalGerman('FÜR'), normalizePersonalGerman('für'));
  });
}

class _MemoryStorage implements PersonalVocabularyStorage {
  _MemoryStorage({this.initial});

  final String? initial;
  String? value;
  bool deleted = false;
  int writes = 0;

  @override
  Future<void> delete() async {
    deleted = true;
    value = null;
  }

  @override
  Future<String?> read() async => value ?? initial;

  @override
  Future<void> write(String value) async {
    writes += 1;
    deleted = false;
    this.value = value;
  }
}
