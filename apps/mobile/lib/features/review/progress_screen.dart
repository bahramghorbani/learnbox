import 'package:flutter/material.dart';

import 'review_queue.dart';

class ProgressScreen extends StatefulWidget {
  const ProgressScreen({
    required this.reviewQueue,
    required this.onStartReview,
    super.key,
  });

  final ReviewQueue reviewQueue;

  /// Returns to the Today destination; never triggers sync.
  final VoidCallback onStartReview;

  @override
  State<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends State<ProgressScreen> {
  late Future<int> _pendingCount;

  @override
  void initState() {
    super.initState();
    _pendingCount = widget.reviewQueue.pendingCount();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        child: FutureBuilder<int>(
          future: _pendingCount,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return Center(
                child: Semantics(
                  label: 'در حال خواندن وضعیت دستگاه',
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
                      child: Text('وضعیت دستگاه خوانده نشد؛ دوباره تلاش کن.'),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => setState(() {
                        _pendingCount = widget.reviewQueue.pendingCount();
                      }),
                      child: const Text('تلاش دوباره'),
                    ),
                  ],
                ),
              );
            }
            final count = snapshot.data!;
            return SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      'پیشرفت',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        '${_persianDigits(count)} پاسخ ذخیره‌شده در این دستگاه',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    count == 0
                        ? 'هنوز پاسخی در این دستگاه ذخیره نشده است.'
                        : 'این پاسخ‌ها فقط در همین دستگاه نگه‌داری می‌شوند.',
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(56),
                    ),
                    onPressed: widget.onStartReview,
                    child: const Text('شروع مرور'),
                  ),
                ],
              ),
            );
          },
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
