import 'package:flutter/material.dart';

import '../../ui/learnbox_theme.dart';
import 'review_queue.dart';
import 'settings_screen.dart';

/// Profile is the fourth persistent learner destination (PDR-006). It shows
/// only device-local facts: the neutral account label and the real pending
/// review count read from [ReviewQueue]. No goal is shown because Android has
/// no device-local goal store yet, and no sign-out, deletion, commerce,
/// phone, reminder or sync state is fabricated.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({required this.reviewQueue, super.key});

  final ReviewQueue reviewQueue;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final FocusNode _settingsRowFocus = FocusNode(debugLabel: 'settings-row');
  late Future<int> _pendingCount;

  @override
  void initState() {
    super.initState();
    _pendingCount = widget.reviewQueue.pendingCount();
  }

  @override
  void dispose() {
    _settingsRowFocus.dispose();
    super.dispose();
  }

  Future<void> _openSettings() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const SettingsScreen()),
    );
    // Return focus to the Settings row so keyboard and screen-reader users
    // continue from where they left.
    if (mounted) {
      _settingsRowFocus.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(
                header: true,
                child: Text(
                  'پروفایل',
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'وضعیت حساب و داده‌های همین دستگاه.',
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: learnBoxMuted),
              ),
              const SizedBox(height: 16),
              const _AccountCard(),
              const SizedBox(height: 16),
              _PendingStatusCard(
                pendingCount: _pendingCount,
                onRetry: () => setState(() {
                  _pendingCount = widget.reviewQueue.pendingCount();
                }),
              ),
              const SizedBox(height: 16),
              Card(
                child: _ProfileRow(
                  key: const ValueKey('profile-settings-row'),
                  label: 'تنظیمات',
                  icon: Icons.settings_outlined,
                  focusNode: _settingsRowFocus,
                  onTap: _openSettings,
                ),
              ),
            ],
          ),
        ),
      );
}

/// Neutral account summary. Static product copy only: the closed alpha is not
/// connected to an authenticated account, so no person identity is invented.
class _AccountCard extends StatelessWidget {
  const _AccountCard();

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'حساب LearnBox',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                'این نسخه از برنامه به یک حساب کاربری وصل نیست؛ داده‌های '
                'یادگیری فقط روی همین دستگاه نگهداری می‌شوند.',
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: learnBoxMuted),
              ),
            ],
          ),
        ),
      );
}

/// Pending-review status card backed by the real device-local [ReviewQueue].
/// The complete Persian phrase is the announced semantics; no bare number is
/// ever announced on its own.
class _PendingStatusCard extends StatelessWidget {
  const _PendingStatusCard({required this.pendingCount, required this.onRetry});

  final Future<int> pendingCount;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'وضعیت دستگاه',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              FutureBuilder<int>(
                future: pendingCount,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: Semantics(
                          label: 'در حال خواندن وضعیت دستگاه',
                          child: const CircularProgressIndicator(),
                        ),
                      ),
                    );
                  }
                  if (snapshot.hasError || !snapshot.hasData) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'وضعیت دستگاه خوانده نشد؛ دوباره تلاش کن.',
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: onRetry,
                          child: const Text('تلاش دوباره'),
                        ),
                      ],
                    );
                  }
                  final count = snapshot.data!;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        count == 0
                            ? 'رویدادی در انتظار همگام‌سازی نیست.'
                            : '${_persianDigits(count)} رویداد در انتظار '
                                'همگام‌سازی',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'این شمارش واقعی از رویدادهای همین دستگاه خوانده '
                        'می‌شود.',
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(color: learnBoxMuted),
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      );
}

/// One tappable account row inside a card. InkWell keeps the row focusable so
/// focus can be restored after returning from a child surface.
class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.label,
    required this.icon,
    required this.onTap,
    this.focusNode,
    super.key,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) => InkWell(
        focusNode: focusNode,
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          child: Row(
            children: [
              Icon(icon, color: learnBoxPrimary),
              const SizedBox(width: 16),
              Expanded(
                child:
                    Text(label, style: Theme.of(context).textTheme.titleMedium),
              ),
            ],
          ),
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
