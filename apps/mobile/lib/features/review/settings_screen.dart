import 'package:flutter/material.dart';

import '../../ui/learnbox_theme.dart';

/// Settings is a child surface opened from Profile (PDR-006). M3-P1 exposes
/// only truthful informational rows: text size follows the device setting and
/// the language is Persian. Nothing here persists, toggles a preference,
/// signs out, deletes data or fabricates a control whose backing feature is
/// not implemented (sound and goal preferences are M3-S1+).
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
                  'در این نسخه، گزینه‌های زیر فقط اطلاعاتی هستند و چیزی روی '
                  'دستگاه تغییر یا ذخیره نمی‌کنند.',
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(color: learnBoxMuted),
                ),
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
