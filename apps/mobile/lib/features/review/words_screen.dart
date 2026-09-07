import 'dart:async';

import 'package:flutter/material.dart';

import 'personal_vocabulary_store.dart';
import 'start_card.dart';
import 'start_pack_repository.dart';

class WordsScreen extends StatefulWidget {
  WordsScreen({
    required this.startPackRepository,
    PersonalVocabularyStore? personalVocabularyStore,
    super.key,
  }) : personalVocabularyStore = personalVocabularyStore ??
            PersonalVocabularyStore(
              storage: SecurePersonalVocabularyStorage(),
            );

  final StartPackRepository startPackRepository;
  final PersonalVocabularyStore personalVocabularyStore;

  @override
  State<WordsScreen> createState() => _WordsScreenState();
}

class _WordsScreenState extends State<WordsScreen> {
  static const _personalWordLimit = 30;
  late Future<List<StartCard>> _session;
  final _searchController = TextEditingController();
  final _searchFocusNode = FocusNode();
  final _personalGermanController = TextEditingController();
  final _personalPersianController = TextEditingController();
  String _query = '';
  List<PersonalVocabularyEntry> _personalWords = const [];
  bool _personalWordsLoading = true;
  bool _showPersonalForm = false;
  bool _savingPersonalWord = false;
  String? _personalWordsError;
  Timer? _personalLoadTimer;
  String? _personalWordNotice;

  @override
  void initState() {
    super.initState();
    _session = widget.startPackRepository.loadDailySession();
    _loadPersonalWords();
  }

  Future<void> _loadPersonalWords() async {
    _personalLoadTimer?.cancel();
    _personalLoadTimer = Timer(const Duration(seconds: 5), () {
      if (!mounted) return;
      setState(() {
        _personalWordsLoading = false;
        _personalWordsError =
            'واژه‌های شخصی این دستگاه خوانده نشد؛ واژه‌های رسمی همچنان در دسترس‌اند.';
      });
    });
    try {
      final words = await widget.personalVocabularyStore.load();
      _personalLoadTimer?.cancel();
      if (!mounted) return;
      setState(() {
        _personalWords = words;
        _personalWordsLoading = false;
        _personalWordsError = null;
      });
    } catch (_) {
      _personalLoadTimer?.cancel();
      if (!mounted) return;
      setState(() {
        _personalWordsLoading = false;
        _personalWordsError =
            'واژه‌های شخصی این دستگاه خوانده نشد؛ واژه‌های رسمی همچنان در دسترس‌اند.';
      });
    }
  }

  void _retryPersonalWords() {
    setState(() {
      _personalWordsLoading = true;
      _personalWordsError = null;
    });
    _loadPersonalWords();
  }

  @override
  void dispose() {
    _personalLoadTimer?.cancel();
    _searchController.dispose();
    _searchFocusNode.dispose();
    _personalGermanController.dispose();
    _personalPersianController.dispose();
    super.dispose();
  }

  List<StartCard> _filterCards(List<StartCard> cards) {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return cards;
    return cards
        .where((card) =>
            card.german.toLowerCase().contains(query) ||
            card.persian.toLowerCase().contains(query))
        .toList(growable: false);
  }

  List<PersonalVocabularyEntry> _filterPersonalWords() {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return _personalWords;
    return _personalWords
        .where((word) =>
            word.german.toLowerCase().contains(query) ||
            word.persian.toLowerCase().contains(query))
        .toList(growable: false);
  }

  TextDirection get _searchDirection =>
      RegExp(r'[\u0600-\u06ff]').hasMatch(_query.trimLeft())
          ? TextDirection.rtl
          : TextDirection.ltr;

  String _persianNumber(int value) => value
      .toString()
      .split('')
      .map((digit) => '۰۱۲۳۴۵۶۷۸۹'[int.parse(digit)])
      .join();

  void _clearSearch() {
    _searchController.clear();
    setState(() => _query = '');
    _searchFocusNode.requestFocus();
  }

  Future<void> _savePersonalWord(List<StartCard> officialCards) async {
    final german =
        _personalGermanController.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    final persian =
        _personalPersianController.text.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (german.isEmpty || persian.isEmpty) {
      setState(
          () => _personalWordNotice = 'هر دو بخش آلمانی و فارسی را کامل کن.');
      return;
    }

    final normalizedGerman = normalizePersonalGerman(german);
    final duplicate = officialCards.any(
          (card) => normalizePersonalGerman(card.german) == normalizedGerman,
        ) ||
        _personalWords.any(
          (word) => normalizePersonalGerman(word.german) == normalizedGerman,
        );
    if (duplicate) {
      setState(
        () => _personalWordNotice = 'این واژه از قبل در فهرست تو هست.',
      );
      return;
    }
    if (_personalWords.length >= _personalWordLimit) {
      setState(
        () => _personalWordNotice = 'سقف ۳۰ واژه شخصی این دستگاه پر شده است.',
      );
      return;
    }

    final entry = PersonalVocabularyEntry(
      id: 'personal-${DateTime.now().microsecondsSinceEpoch}',
      german: german,
      persian: persian,
    );
    setState(() {
      _savingPersonalWord = true;
      _personalWordNotice = null;
    });
    try {
      final nextWords = [..._personalWords, entry];
      await widget.personalVocabularyStore.save(nextWords);
      if (!mounted) return;
      setState(() {
        _personalWords = nextWords;
        _savingPersonalWord = false;
        _showPersonalForm = false;
        _personalWordNotice = 'واژه روی این دستگاه ذخیره شد.';
        _personalGermanController.clear();
        _personalPersianController.clear();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _savingPersonalWord = false;
        _personalWordNotice = 'ذخیرهٔ واژه انجام نشد؛ دوباره تلاش کن.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        child: FutureBuilder<List<StartCard>>(
          future: _session,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return Center(
                child: Semantics(
                  label: 'در حال آماده‌کردن واژه‌ها',
                  child: CircularProgressIndicator(),
                ),
              );
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Semantics(
                      liveRegion: true,
                      child: Text('واژه‌ها آماده نشد؛ دوباره تلاش کن.'),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => setState(() {
                        _session =
                            widget.startPackRepository.loadDailySession();
                      }),
                      child: const Text('تلاش دوباره'),
                    ),
                  ],
                ),
              );
            }
            final cards = snapshot.data!;
            if (cards.isEmpty) {
              return const Center(
                  child: Text('واژه‌ای برای نمایش آماده نیست.'));
            }
            final visibleCards = _filterCards(cards);
            final visiblePersonalWords = _filterPersonalWords();
            final noResults =
                visibleCards.isEmpty && visiblePersonalWords.isEmpty;
            return ListView(
              key: const ValueKey('words-list'),
              padding: const EdgeInsets.all(24),
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    'واژه‌های شروع',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _searchController,
                  focusNode: _searchFocusNode,
                  textDirection: _searchDirection,
                  textInputAction: TextInputAction.search,
                  onChanged: (value) => setState(() => _query = value),
                  decoration: const InputDecoration(
                    labelText: 'جست‌وجوی واژه‌های آلمانی و فارسی',
                    prefixIcon: Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(20)),
                    ),
                    constraints: BoxConstraints(minHeight: 48),
                  ),
                ),
                const SizedBox(height: 16),
                if (noResults)
                  Semantics(
                    liveRegion: true,
                    child: Column(
                      children: [
                        const Text('واژه‌ای پیدا نشد.'),
                        const SizedBox(height: 12),
                        OutlinedButton(
                          onPressed: _clearSearch,
                          child: const Text('پاک کردن جست‌وجو'),
                        ),
                      ],
                    ),
                  )
                else ...[
                  Semantics(
                    header: true,
                    child: Text(
                      'واژه‌های رسمی',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('${_persianNumber(visibleCards.length)} واژه رسمی'),
                  const SizedBox(height: 12),
                  for (final card in visibleCards) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Semantics(
                              label: 'تصویر واژه ${card.german}',
                              image: true,
                              container: true,
                              child: Image.asset(
                                card.imageAsset,
                                width: 72,
                                height: 72,
                                fit: BoxFit.cover,
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Directionality(
                                    textDirection: TextDirection.ltr,
                                    child: Text(
                                      card.german,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleLarge,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(card.persian),
                                  const SizedBox(height: 6),
                                  const Text('رسمی'),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Semantics(
                    header: true,
                    child: Text(
                      'واژه‌های شخصی این دستگاه',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${_persianNumber(_personalWords.length)} از ۳۰ واژه شخصی',
                  ),
                  const SizedBox(height: 12),
                  if (_personalWordsLoading)
                    Semantics(
                      label: 'در حال خواندن واژه‌های شخصی این دستگاه',
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_personalWordsError != null)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          liveRegion: true,
                          child: Text(_personalWordsError!),
                        ),
                        const SizedBox(height: 8),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 48),
                          ),
                          onPressed: _retryPersonalWords,
                          child: const Text('تلاش دوباره برای واژه‌های شخصی'),
                        ),
                      ],
                    )
                  else if (visiblePersonalWords.isEmpty)
                    const Text('هنوز واژهٔ شخصی روی این دستگاه نداری.')
                  else
                    for (final word in visiblePersonalWords) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Directionality(
                                textDirection: TextDirection.ltr,
                                child: Text(
                                  word.german,
                                  style: Theme.of(context).textTheme.titleLarge,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(word.persian),
                              const SizedBox(height: 6),
                              const Text('شخصی'),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  if (!_personalWordsLoading &&
                      _personalWordsError == null) ...[
                    if (_personalWords.length >= _personalWordLimit) ...[
                      const Text('سقف ۳۰ واژه شخصی این دستگاه پر شده است.'),
                      const SizedBox(height: 12),
                    ],
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      onPressed: _personalWords.length >= _personalWordLimit
                          ? null
                          : () => setState(() {
                                _showPersonalForm = !_showPersonalForm;
                                _personalWordNotice = null;
                              }),
                      icon: const Icon(Icons.add),
                      label: const Text('افزودن واژه شخصی'),
                    ),
                    if (_showPersonalForm) ...[
                      const SizedBox(height: 12),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              TextField(
                                controller: _personalGermanController,
                                textDirection: TextDirection.ltr,
                                decoration: const InputDecoration(
                                  labelText: 'واژه آلمانی',
                                  border: OutlineInputBorder(),
                                  constraints: BoxConstraints(minHeight: 48),
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _personalPersianController,
                                textDirection: TextDirection.rtl,
                                decoration: const InputDecoration(
                                  labelText: 'معنی فارسی',
                                  border: OutlineInputBorder(),
                                  constraints: BoxConstraints(minHeight: 48),
                                ),
                              ),
                              const SizedBox(height: 12),
                              FilledButton(
                                style: FilledButton.styleFrom(
                                  minimumSize: const Size.fromHeight(48),
                                ),
                                onPressed: _savingPersonalWord
                                    ? null
                                    : () => _savePersonalWord(cards),
                                child: Text(_savingPersonalWord
                                    ? 'در حال ذخیره روی این دستگاه'
                                    : 'ذخیره روی این دستگاه'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    if (_personalWordNotice != null) ...[
                      const SizedBox(height: 12),
                      Semantics(
                        liveRegion: true,
                        child: Text(_personalWordNotice!),
                      ),
                    ],
                  ],
                ],
              ],
            );
          },
        ),
      );
}
