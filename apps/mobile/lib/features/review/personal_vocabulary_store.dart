import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class PersonalVocabularyStorage {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> delete();
}

class SecurePersonalVocabularyStorage implements PersonalVocabularyStorage {
  SecurePersonalVocabularyStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                resetOnError: false,
                migrateOnAlgorithmChange: true,
                migrateWithBackup: true,
                storageNamespace: storageNamespace,
              ),
            );

  static const storageKey = 'learnbox.personalVocabulary.v1';
  static const storageNamespace = 'learnbox.personalVocabulary.v1';

  final FlutterSecureStorage _storage;

  @override
  Future<void> delete() => _storage.delete(key: storageKey);

  @override
  Future<String?> read() => _storage.read(key: storageKey);

  @override
  Future<void> write(String value) =>
      _storage.write(key: storageKey, value: value);
}

class PersonalVocabularyStore {
  PersonalVocabularyStore({required PersonalVocabularyStorage storage})
      : _storage = storage;

  final PersonalVocabularyStorage _storage;

  Future<List<PersonalVocabularyEntry>> load() async {
    final serialized = await _storage.read();
    if (serialized == null || serialized.trim().isEmpty) return const [];

    try {
      final decoded = jsonDecode(serialized);
      if (decoded is! List) return const [];
      return decoded
          .map(PersonalVocabularyEntry.fromJson)
          .whereType<PersonalVocabularyEntry>()
          .toList(growable: false);
    } on FormatException {
      return const [];
    }
  }

  Future<void> save(List<PersonalVocabularyEntry> entries) async {
    if (entries.isEmpty) {
      await _storage.delete();
      return;
    }
    await _storage
        .write(jsonEncode(entries.map((entry) => entry.toJson()).toList()));
  }
}

class PersonalVocabularyEntry {
  const PersonalVocabularyEntry({
    required this.id,
    required this.german,
    required this.persian,
  });

  final String id;
  final String german;
  final String persian;

  static PersonalVocabularyEntry? fromJson(Object? value) {
    if (value is! Map<String, dynamic> ||
        value.length != 3 ||
        !value.containsKey('id') ||
        !value.containsKey('german') ||
        !value.containsKey('persian')) {
      return null;
    }
    final id = value['id'];
    final german = value['german'];
    final persian = value['persian'];
    if (id is! String || german is! String || persian is! String) {
      return null;
    }
    final cleanId = id.trim();
    final cleanGerman = german.trim().replaceAll(RegExp(r'\s+'), ' ');
    final cleanPersian = persian.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (cleanId.isEmpty || cleanGerman.isEmpty || cleanPersian.isEmpty) {
      return null;
    }
    return PersonalVocabularyEntry(
      id: cleanId,
      german: cleanGerman,
      persian: cleanPersian,
    );
  }

  Map<String, String> toJson() => {
        'id': id,
        'german': german,
        'persian': persian,
      };

  @override
  bool operator ==(Object other) =>
      other is PersonalVocabularyEntry &&
      other.id == id &&
      other.german == german &&
      other.persian == persian;

  @override
  int get hashCode => Object.hash(id, german, persian);
}

String normalizePersonalGerman(String value) =>
    value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
