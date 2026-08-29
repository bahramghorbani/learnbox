import 'package:flutter/material.dart';

import '../../ui/learner_bottom_navigation.dart';
import '../../ui/learnbox_theme.dart';
import 'pronunciation_player.dart';
import 'review_queue.dart';
import 'review_screen.dart';
import 'start_card.dart';
import 'start_pack_repository.dart';

class TodayScreen extends StatefulWidget {
  const TodayScreen({
    required this.startPackRepository,
    required this.reviewQueue,
    required this.pronunciationPlayer,
    this.onDestinationSelected,
    super.key,
  });

  final StartPackRepository startPackRepository;
  final ReviewQueue reviewQueue;
  final PronunciationPlayer pronunciationPlayer;

  /// Optional injected navigation callback. When null, Today renders without
  /// the bottom navigation so the owning shell provides the only one.
  final ValueChanged<LearnerDestination>? onDestinationSelected;

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  late Future<List<StartCard>> _session;
  int? _pendingCount;

  @override
  void initState() {
    super.initState();
    _loadSession();
    _loadPendingCount();
  }

  void _loadSession() {
    _session = widget.startPackRepository.loadDailySession();
  }

  /// Reads the device-local pending queue truthfully. A failed read keeps the
  /// session usable and shows no pending chip (fail-closed).
  Future<void> _loadPendingCount() async {
    try {
      final count = await widget.reviewQueue.pendingCount();
      if (mounted) {
        setState(() => _pendingCount = count);
      }
    } catch (_) {
      // The local queue is unavailable; Today keeps working from the bundled
      // session and never claims a pending count it could not read.
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
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
                  pendingCount: _pendingCount,
                  onStart: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => ReviewScreen(
                        cards: cards,
                        reviewQueue: widget.reviewQueue,
                        pronunciationPlayer: widget.pronunciationPlayer,
                      ),
                    ),
                  ),
                  onDestinationSelected: widget.onDestinationSelected,
                );
              },
            ),
          ),
        ),
      );
}

class _TodayContent extends StatelessWidget {
  const _TodayContent({
    required this.cards,
    required this.pendingCount,
    required this.onStart,
    required this.onDestinationSelected,
  });

  final List<StartCard> cards;
  final int? pendingCount;
  final VoidCallback onStart;
  final ValueChanged<LearnerDestination>? onDestinationSelected;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 24),
                  Text(
                    'بیایید امروز هم چند واژهٔ آلمانی را مرور کنیم',
                    style: Theme.of(context)
                        .textTheme
                        .labelLarge
                        ?.copyWith(color: learnBoxPrimary),
                  ),
                  const SizedBox(height: 8),
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
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${_persianDigits(cards.length)} کارت برای مرور امروز آماده است.',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'یک مرور کوتاه و آرام؛ پاسخ هر کارت روی همین دستگاه ذخیره می‌شود.',
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و هنوز به '
                            'سرور وصل نشده است.',
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: learnBoxMuted),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (pendingCount case final pendingCount?
                      when pendingCount > 0)
                    _PendingSyncChip(count: pendingCount),
                  if (constraints.maxHeight >= 620) ...[
                    const Spacer(),
                    ExcludeSemantics(
                      child: Image.asset(
                        'assets/bobo/encourage-v2.png',
                        width: 120,
                        height: 120,
                        excludeFromSemantics: true,
                      ),
                    ),
                  ] else
                    const Spacer(),
                  const SizedBox(height: 24),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(56),
                    ),
                    onPressed: onStart,
                    child: const Text('شروع مرور'),
                  ),
                  if (onDestinationSelected != null) ...[
                    const SizedBox(height: 16),
                    LearnerBottomNavigation(
                      current: LearnerDestination.today,
                      onDestinationSelected: onDestinationSelected!,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
}

/// D1 sync-state chip: shows only when the device-local queue has real
/// pending events awaiting an acknowledgement. Count is the local queue
/// length; the server acknowledgement remains the only way events leave it.
class _PendingSyncChip extends StatelessWidget {
  const _PendingSyncChip({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) => Semantics(
        container: true,
        label: 'رویدادهای در انتظار همگام‌سازی',
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: learnBoxLavender,
            borderRadius: BorderRadius.circular(99),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_sync_outlined,
                    size: 18, color: learnBoxPrimary),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    '${_persianDigits(count)} رویداد در انتظار همگام‌سازی',
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: learnBoxPrimary,
                        ),
                  ),
                ),
              ],
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