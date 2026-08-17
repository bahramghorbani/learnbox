import 'package:flutter/material.dart';

/// Daily-completion surface shown after the last card is graded.
///
/// This is presentation-only: it receives result state (pending count and any
/// storage error) and never mutates the queue, invokes sync or claims an
/// upload. The return action pops back to the first route (Today).
class CompletionScreen extends StatelessWidget {
  const CompletionScreen({
    required this.pendingCount,
    required this.storageError,
    required this.onReturnToToday,
    super.key,
  });

  final int? pendingCount;
  final String? storageError;
  final VoidCallback onReturnToToday;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('مرور امروز')),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight - 48,
                ),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Semantics(
                        label: 'بوبو موفقیت تو را جشن می‌گیرد',
                        image: true,
                        child: Image.asset(
                          'assets/bobo/celebrate-v2.png',
                          width: 140,
                          height: 140,
                          excludeFromSemantics: false,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Semantics(
                        header: true,
                        child: Text(
                          'آفرین، مرور امروز تمام شد.',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (pendingCount case final pendingCount?)
                        Text(
                          '${_persianDigits(pendingCount)} پاسخ در این دستگاه آماده است.',
                          textAlign: TextAlign.center,
                        )
                      else if (storageError != null)
                        Text(storageError!, textAlign: TextAlign.center)
                      else
                        Semantics(
                          label: 'در حال شمارش پاسخ‌های ذخیره‌شده',
                          child: const CircularProgressIndicator(),
                        ),
                      const SizedBox(height: 24),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(56),
                        ),
                        onPressed: onReturnToToday,
                        child: const Text('بازگشت به امروز'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
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
