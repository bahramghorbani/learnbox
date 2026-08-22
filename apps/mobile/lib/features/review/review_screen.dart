import 'dart:async';

import 'package:flutter/material.dart';

import 'completion_screen.dart';
import 'pronunciation_player.dart';
import 'review_grade.dart';
import 'review_queue.dart';
import 'start_card.dart';
import 'start_pack_audio_assets.dart';
import '../../ui/learnbox_theme.dart';

class ReviewScreen extends StatefulWidget {
  const ReviewScreen({
    required this.cards,
    required this.reviewQueue,
    required this.pronunciationPlayer,
    super.key,
  });

  final List<StartCard> cards;
  final ReviewQueue reviewQueue;
  final PronunciationPlayer pronunciationPlayer;

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
  String? _audioError;
  var _isStartingAudio = false;

  StartCard get _card => widget.cards[_cardIndex];

  Future<void> _playAudio(String? assetPath) async {
    if (assetPath == null || _isStartingAudio) return;
    setState(() {
      _isStartingAudio = true;
      _audioError = null;
    });
    try {
      await widget.pronunciationPlayer.playAsset(assetPath);
    } catch (_) {
      if (mounted) {
        setState(() => _audioError = 'پخش صدا انجام نشد؛ دوباره تلاش کن.');
      }
    } finally {
      if (mounted) setState(() => _isStartingAudio = false);
    }
  }

  Future<void> _stopPlayback() async {
    try {
      await widget.pronunciationPlayer.stop();
    } catch (_) {
      // Cleanup must never block review persistence or navigation.
    }
  }

  @override
  void dispose() {
    unawaited(_stopPlayback());
    super.dispose();
  }

  Future<void> _grade(ReviewGrade grade) async {
    if (_isSaving) {
      return;
    }
    setState(() {
      _isSaving = true;
      _storageError = null;
    });
    unawaited(_stopPlayback());

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
        _audioError = null;
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
    final wordAudioPath = StartPackAudioAssets.wordPath(card.id);
    final sentenceAudioPath = StartPackAudioAssets.sentencePath(card.id);
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
              Semantics(
                label:
                    'پیشرفت مرور: ${_persianDigits(_cardIndex + 1)} از ${_persianDigits(widget.cards.length)}',
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: (_cardIndex + 1) / widget.cards.length,
                    minHeight: 8,
                    color: learnBoxPrimary,
                    backgroundColor: learnBoxLavender,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Card(
                margin: EdgeInsets.zero,
                clipBehavior: Clip.antiAlias,
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image.asset(
                    card.imageAsset,
                    fit: BoxFit.cover,
                    semanticLabel: 'تصویر واژه ${card.german}',
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
                decoration: BoxDecoration(
                  color: learnBoxLavender,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(
                    card.german,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontFamily: learnBoxFontFamily,
                          fontWeight: FontWeight.w800,
                          color: learnBoxInk,
                        ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              if (wordAudioPath != null) ...[
                _AudioButton(
                  label: 'پخش تلفظ واژه',
                  enabled: !_isStartingAudio,
                  onPressed: () => _playAudio(wordAudioPath),
                ),
                const SizedBox(height: 12),
              ],
              if (_audioError != null) ...[
                Semantics(
                  liveRegion: true,
                  child: Text(
                    _audioError!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              if (!_answerVisible)
                FilledButton.tonal(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(56),
                    backgroundColor: learnBoxLavender,
                    foregroundColor: learnBoxPrimary,
                  ),
                  onPressed: () => setState(() => _answerVisible = true),
                  child: const Text('نمایش پاسخ'),
                )
              else ...[
                Card(
                  margin: EdgeInsets.zero,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          card.persian,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 12),
                        Directionality(
                          textDirection: TextDirection.ltr,
                          child: Text(
                            card.definition,
                            textAlign: TextAlign.center,
                            style: learnBoxGermanStyle(context),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Directionality(
                          textDirection: TextDirection.ltr,
                          child: Text(
                            card.exampleGerman,
                            textAlign: TextAlign.center,
                            style: learnBoxGermanStyle(context),
                          ),
                        ),
                        if (sentenceAudioPath != null) ...[
                          const SizedBox(height: 12),
                          _AudioButton(
                            label: 'پخش جمله نمونه',
                            enabled: !_isStartingAudio,
                            onPressed: () => _playAudio(sentenceAudioPath),
                          ),
                        ],
                        const SizedBox(height: 6),
                        Text(
                          card.examplePersian,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: learnBoxMuted),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'یادآوری‌ات چطور بود؟',
                  textAlign: TextAlign.right,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 12),
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

class _AudioButton extends StatelessWidget {
  const _AudioButton({
    required this.label,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(56),
        ),
        onPressed: enabled ? onPressed : null,
        icon: const Icon(Icons.volume_up_outlined),
        label: Text(label),
      );
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
