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

  test('malformed stored entries are ignored without crashing', () async {
    final storage = _MemoryStorage(
      initial:
          '[{"id":"ok","german":"das Buch","persian":"کتاب"},{"id":7,"german":null},{"unexpected":true}]',
    );
    final store = PersonalVocabularyStore(storage: storage);

    expect(
      await store.load(),
      const [
        PersonalVocabularyEntry(
          id: 'ok',
          german: 'das Buch',
          persian: 'کتاب',
        ),
      ],
    );
  });

  test('malformed top-level storage is treated as an empty local list',
      () async {
    final store = PersonalVocabularyStore(
      storage: _MemoryStorage(initial: '{not-json'),
    );

    expect(await store.load(), isEmpty);
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
}

class _MemoryStorage implements PersonalVocabularyStorage {
  _MemoryStorage({this.initial});

  final String? initial;
  String? value;
  bool deleted = false;

  @override
  Future<void> delete() async {
    deleted = true;
    value = null;
  }

  @override
  Future<String?> read() async => value ?? initial;

  @override
  Future<void> write(String value) async {
    deleted = false;
    this.value = value;
  }
}
