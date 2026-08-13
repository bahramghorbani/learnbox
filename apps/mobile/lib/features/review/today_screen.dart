import 'package:flutter/material.dart';

import 'review_queue.dart';
import 'review_screen.dart';
import 'start_card.dart';
import 'start_pack_repository.dart';

class TodayScreen extends StatefulWidget {
  const TodayScreen({
    required this.startPackRepository,
    required this.reviewQueue,
    super.key,
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  late Future<List<StartCard>> _session;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  void _loadSession() {
    _session = widget.startPackRepository.loadDailySession();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: FutureBuilder<List<StartCard>>(
              future: _session,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return Center(
                    child: Semantics(
                      label: 'در حال آماده‌کردن مرور امروز',
                      child: const CircularProgressIndicator(),
                    ),
                  );
                }
                if (snapshot.hasError || !snapshot.hasData) {
                  return _TodayError(onRetry: () {
                    setState(_loadSession);
                  });
                }
                final cards = snapshot.data!;
                if (cards.isEmpty) {
                  return const Center(
                    child: Text('امروز کارتی برای مرور آماده نیست.'),
                  );
                }
                return _TodayContent(
                  cards: cards,
                  onStart: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => ReviewScreen(
                        cards: cards,
                        reviewQueue: widget.reviewQueue,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      );
}

class _TodayContent extends StatelessWidget {
  const _TodayContent({required this.cards, required this.onStart});

  final List<StartCard> cards;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      'امروز',
                      style:
                          Theme.of(context).textTheme.headlineLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                              ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    '${_persianDigits(cards.length)} کارت برای مرور امروز آماده است.',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'یک مرور کوتاه و آرام؛ پاسخ هر کارت روی همین دستگاه ذخیره می‌شود.',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const Spacer(),
                  const SizedBox(height: 24),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(56),
                    ),
                    onPressed: onStart,
                    child: const Text('شروع مرور'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class _TodayError extends StatelessWidget {
  const _TodayError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('مرور امروز آماده نشد؛ دوباره تلاش کن.'),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(
                minimumSize: const Size(160, 52),
              ),
              onPressed: onRetry,
              child: const Text('تلاش دوباره'),
            ),
          ],
        ),
      );
}

String _persianDigits(int value) => value
    .toString()
    .replaceAll('0', '۰')
    .replaceAll('1', '۱')
    .replaceAll('2', '۲')
    .replaceAll('3', '۳')
    .replaceAll('4', '۴')
    .replaceAll('5', '۵')
    .replaceAll('6', '۶')
    .replaceAll('7', '۷')
    .replaceAll('8', '۸')
    .replaceAll('9', '۹');
