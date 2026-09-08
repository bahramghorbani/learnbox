import 'package:flutter/material.dart';

import '../../ui/learnbox_theme.dart';
import 'sound_preference_store.dart';

/// Settings is a child surface opened from Profile (PDR-006). M3-S1 adds the
/// first real device-local preference: the pronunciation sound switch backed
/// by the versioned secure `SoundPreferenceStore` (default enabled). The
/// remaining rows stay truthful informational-only rows; nothing here signs
/// out, deletes data or fabricates a control whose backing feature is not
/// implemented.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final FocusNode _backFocus = FocusNode(debugLabel: 'settings-back');

  @override
  void initState() {
    super.initState();
    // Land keyboard and screen-reader focus on the labelled back action when
    // the child surface opens.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _backFocus.requestFocus();
      }
    });
  }

  @override
  void dispose() {
    _backFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    focusNode: _backFocus,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(64, 48),
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('بازگشت به پروفایل'),
                  ),
                ),
                const SizedBox(height: 8),
                Semantics(
                  header: true,
                  child: Text(
                    'تنظیمات',
                    style: Theme.of(context)
                        .textTheme
                        .headlineLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'تنظیمات صدا روی همین دستگاه ذخیره می‌شود؛ بقیهٔ گزینه‌ها در '
                  'این نسخه فقط اطلاعاتی هستند.',
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(color: learnBoxMuted),
                ),
                const SizedBox(height: 16),
                const _SoundPreferenceCard(),
                const SizedBox(height: 16),
                const _InfoCard(
                  title: 'اندازهٔ متن',
                  caption: 'اندازهٔ متن از تنظیم نمایش دستگاه پیروی می‌کند و '
                      'درون برنامه قابل تغییر نیست.',
                ),
                const SizedBox(height: 16),
                const _InfoCard(
                  title: 'زبان',
                  value: 'فارسی',
                  caption: 'زبان برنامه فارسی است و متن‌ها راست‌به‌چپ نمایش '
                      'داده می‌شوند.',
                ),
              ],
            ),
          ),
        ),
      );
}

class _SoundPreferenceCard extends StatelessWidget {
  const _SoundPreferenceCard();

  @override
  Widget build(BuildContext context) {
    final controller = SoundPreferenceScope.maybeOf(context);
    if (controller == null) return const SizedBox.shrink();
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SwitchListTile(
              key: const ValueKey('sound-preference-switch'),
              value: controller.soundEnabled,
              onChanged: controller.saving || controller.loading
                  ? null
                  : controller.setEnabled,
              title: const Text('پخش تلفظ'),
              subtitle: const Text('پخش صدای واژه‌ها هنگام مرور'),
              contentPadding: EdgeInsets.zero,
            ),
            const SizedBox(height: 4),
            if (controller.loading)
              Semantics(
                key: const ValueKey('sound-loading-live-region'),
                liveRegion: true,
                child: Row(
                  children: [
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'در حال خواندن تنظیم صدا',
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: learnBoxMuted),
                    ),
                  ],
                ),
              )
            else if (controller.saveFailed) ...[
              Semantics(
                key: const ValueKey('sound-save-error-live-region'),
                liveRegion: true,
                child: Text(
                  'ذخیرهٔ تنظیم انجام نشد؛ دوباره تلاش کن.',
                  textAlign: TextAlign.start,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: controller.saving ? null : controller.retry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('تلاش دوباره'),
                ),
              ),
            ] else if (controller.loadFailed)
              Semantics(
                key: const ValueKey('sound-read-error-live-region'),
                liveRegion: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'خواندن تنظیم صدا انجام نشد؛ پخش صدا روشن فرض شد.',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton.icon(
                        onPressed:
                            controller.loading ? null : controller.retryLoad,
                        icon: const Icon(Icons.refresh),
                        label: const Text('تلاش دوباره'),
                      ),
                    ),
                  ],
                ),
              )
            else if (controller.lastSaveSucceeded == true)
              Semantics(
                key: const ValueKey('sound-saved-live-region'),
                liveRegion: true,
                child: Text(
                  'تنظیم ذخیره شد.',
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(color: learnBoxPrimary),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, this.value, required this.caption});

  final String title;

  /// Optional emphasized current value; informational only, never a control.
  final String? value;

  final String caption;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (value != null)
                    Text(
                      value!,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(color: learnBoxPrimary),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                caption,
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
