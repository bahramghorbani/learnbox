import 'package:flutter/material.dart';

import 'start_card.dart';
import 'start_pack_repository.dart';

class WordsScreen extends StatefulWidget {
  const WordsScreen({required this.startPackRepository, super.key});

  final StartPackRepository startPackRepository;

  @override
  State<WordsScreen> createState() => _WordsScreenState();
}

class _WordsScreenState extends State<WordsScreen> {
  late Future<List<StartCard>> _session;
  final _searchController = TextEditingController();
  final _searchFocusNode = FocusNode();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _session = widget.startPackRepository.loadDailySession();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
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
            return ListView.separated(
              key: const ValueKey('words-list'),
              padding: const EdgeInsets.all(24),
              itemCount: visibleCards.isEmpty ? 3 : visibleCards.length + 3,
              separatorBuilder: (context, index) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Semantics(
                    header: true,
                    child: Text(
                      'واژه‌های شروع',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                  );
                }
                if (index == 1) {
                  return TextField(
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
                  );
                }
                if (visibleCards.isEmpty) {
                  return Semantics(
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
                  );
                }
                if (index == 2) {
                  return Text(
                      '${_persianNumber(visibleCards.length)} واژه رسمی');
                }
                final card = visibleCards[index - 3];
                return Card(
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
                                  style: Theme.of(context).textTheme.titleLarge,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(card.persian),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      );
}
