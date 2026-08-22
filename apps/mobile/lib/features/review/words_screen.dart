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

  @override
  void initState() {
    super.initState();
    _session = widget.startPackRepository.loadDailySession();
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
            return ListView.separated(
              padding: const EdgeInsets.all(24),
              itemCount: cards.length + 1,
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
                final card = cards[index - 1];
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
