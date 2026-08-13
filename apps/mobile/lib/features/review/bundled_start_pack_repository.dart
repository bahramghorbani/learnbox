import 'dart:convert';

import 'start_card.dart';
import 'start_pack_repository.dart';

class BundledStartPackRepository implements StartPackRepository {
  BundledStartPackRepository._(this._cards);

  factory BundledStartPackRepository.fromJsonString(String jsonString) {
    final decoded = _decode(jsonString);
    return BundledStartPackRepository._(List.unmodifiable(decoded));
  }

  final List<StartCard> _cards;

  @override
  Future<List<StartCard>> loadDailySession() async => _cards;

  static List<StartCard> _decode(String jsonString) {
    try {
      final root = jsonDecode(jsonString);
      if (root is! Map<String, dynamic>) {
        throw const FormatException('Invalid Start bundle.');
      }
      final cards = root['cards'];
      if (cards is! List || cards.length != 3) {
        throw const FormatException('Invalid Start bundle.');
      }

      final parsed = cards.map(_parseCard).toList(growable: false);
      const expectedIds = ['start-a1-haus', 'start-a1-tisch', 'start-a1-tuer'];
      if (parsed.map((card) => card.id).join(',') != expectedIds.join(',')) {
        throw const FormatException('Invalid Start bundle.');
      }
      return parsed;
    } on FormatException {
      rethrow;
    } catch (_) {
      throw const FormatException('Invalid Start bundle.');
    }
  }

  static StartCard _parseCard(dynamic value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('Invalid Start card.');
    }
    final example = value['example'];
    if (example is! Map<String, dynamic>) {
      throw const FormatException('Invalid Start card.');
    }

    return StartCard(
      id: _requiredString(value, 'id'),
      german: _requiredString(value, 'german'),
      persian: _requiredString(value, 'persian'),
      definition: _requiredString(value, 'definition'),
      exampleGerman: _requiredString(example, 'german'),
      examplePersian: _requiredString(example, 'persian'),
      imageAsset: _requiredString(value, 'imageAsset'),
      wordAudioAsset: _requiredString(value, 'wordAudioAsset'),
      sentenceAudioAsset: _requiredString(value, 'sentenceAudioAsset'),
    );
  }

  static String _requiredString(Map<String, dynamic> value, String key) {
    final field = value[key];
    if (field is! String || field.isEmpty) {
      throw const FormatException('Invalid Start card.');
    }
    return field;
  }
}
