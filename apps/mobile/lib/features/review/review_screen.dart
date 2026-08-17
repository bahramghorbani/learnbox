import 'package:flutter/material.dart';

import 'completion_screen.dart';
import 'review_grade.dart';
import 'review_queue.dart';
import 'start_card.dart';

class ReviewScreen extends StatefulWidget {
  const ReviewScreen({
    required this.cards,
    required this.reviewQueue,
    super.key,
  });

  final List<StartCard> cards;
  final ReviewQueue reviewQueue;

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  var _cardIndex = 0;
  var _answerVisible = false;
  var _isSaving = false;
  var _isComplete = false;
  int? _pendingCount;
  String? _storageError;

  StartCard get _card => widget.cards[_cardIndex];

  Future<void> _grade(ReviewGrade grade) async {
    if (_isSaving) {
      return;
    }
    setState(() {
      _isSaving = true;
      _storageError = null;
    });

    try {
      await widget.reviewQueue.record(_card.id, grade, DateTime.now());
    } catch (_) {
      if (mounted) {
        setState(() {
          _isSaving = false;
          _storageError = 'ذخیره انجام نشد؛ دوباره تلاش کن.';
        });
      }
      return;
    }

    if (!mounted) {
      return;
    }
    if (_cardIndex < widget.cards.length - 1) {
      setState(() {
        _cardIndex += 1;
        _answerVisible = false;
        _isSaving = false;
      });
      return;
    }

    setState(() {
      _isComplete = true;
      _isSaving = false;
    });
    try {
      final pendingCount = await widget.reviewQueue.pendingCount();
      if (mounted) {
        setState(() => _pendingCount = pendingCount);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _storageError =
            'پاسخ‌ها ذخیره شدند؛ شمارش آن‌ها فعلاً در دسترس نیست.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isComplete) {
      return CompletionScreen(
        pendingCount: _pendingCount,
        storageError: _storageError,
        onReturnToToday: () =>
            Navigator.of(context).popUntil((route) => route.isFirst),
      );
    }

    final card = _card;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'کارت ${_persianDigits(_cardIndex + 1)} از ${_persianDigits(widget.cards.length)}',
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LinearProgressIndicator(
                value: (_cardIndex + 1) / widget.cards.length,
                semanticsLabel:
                    'پیشرفت مرور: ${_persianDigits(_cardIndex + 1)} از ${_persianDigits(widget.cards.length)}',
              ),
              const SizedBox(height: 20),
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image.asset(
                    card.imageAsset,
                    fit: BoxFit.cover,
                    semanticLabel: 'تصویر واژه ${card.german}',
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Directionality(
                textDirection: TextDirection.ltr,
                child: Text(
                  card.german,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              const SizedBox(height: 18),
              if (!_answerVisible)
                FilledButton.tonal(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(56),
                  ),
                  onPressed: () => setState(() => _answerVisible = true),
                  child: const Text('نمایش پاسخ'),
                )
              else ...[
                Text(
                  card.persian,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 8),
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(
                    card.definition,
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 12),
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(
                    card.exampleGerman,
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 4),
                Text(card.examplePersian, textAlign: TextAlign.center),
                const SizedBox(height: 18),
                if (_storageError != null) ...[
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      _storageError!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                _GradeButtons(
                  enabled: !_isSaving,
                  onGrade: _grade,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _GradeButtons extends StatelessWidget {
  const _GradeButtons({required this.enabled, required this.onGrade});

  final bool enabled;
  final ValueChanged<ReviewGrade> onGrade;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final width = (constraints.maxWidth - 12) / 2;
          final useSingleColumn = constraints.maxWidth < 360 ||
              MediaQuery.textScalerOf(context).scale(16) > 20;
          return Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final entry in _gradeLabels.entries)
                SizedBox(
                  width: useSingleColumn ? constraints.maxWidth : width,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 56),
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                      onPressed: enabled ? () => onGrade(entry.value) : null,
                      child: Text(
                        entry.key,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      );
}

const _gradeLabels = {
  'دوباره می‌خوانم': ReviewGrade.forgot,
  'سخت بود': ReviewGrade.hard,
  'بلد بودم': ReviewGrade.remembered,
  'خیلی آسان بود': ReviewGrade.mastered,
};

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
