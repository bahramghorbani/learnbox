import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:learnbox/app.dart';
import 'package:learnbox/features/review/completion_screen.dart';
import 'package:learnbox/features/review/personal_vocabulary_store.dart';
import 'package:learnbox/features/review/review_queue.dart';
import 'package:learnbox/features/review/review_queue_store.dart';
import 'package:learnbox/features/review/sound_preference_store.dart';
import 'package:learnbox/features/review/start_card.dart';
import 'package:learnbox/features/review/start_pack_repository.dart';
import 'package:learnbox/features/review/words_screen.dart';

import 'support/sound_preference_test_storage.dart';
import 'mobile_learning_loop_test.dart'
    show ControlledReviewQueueStore, InMemoryStartPackRepository;

void main() {
  testWidgets(
      'Today shows title, count and primary action in a readable layout',
      (tester) async {
    await _pumpApp(tester);

    // "امروز" appears as the heading and as the active bottom-navigation
    // label, so it is present exactly twice.
    expect(find.text('امروز'), findsNWidgets(2));
    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('decorative Bobo is excluded from semantics when shown',
      (tester) async {
    await _pumpApp(tester, size: const Size(390, 844));

    final bobo = find.byType(Image);
    expect(bobo, findsOneWidget);
    // The encouraging Bobo is decorative: its asset must not be exposed to
    // screen readers as meaningful content.
    final image = tester.widget<Image>(bobo);
    expect(image.excludeFromSemantics, isTrue);
  });

  testWidgets('Words shows exactly three canonical offline cards',
      (tester) async {
    await _pumpApp(tester);

    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();

    expect(find.text('واژه‌های شروع'), findsOneWidget);
    expect(find.text('das Haus'), findsOneWidget);
    expect(find.text('der Tisch'), findsOneWidget);
    expect(find.text('die Tür'), findsOneWidget);
    expect(find.byType(Card), findsNWidgets(3));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Words lists the exact canonical cards in canonical order with labeled images',
      (tester) async {
    await _pumpApp(tester);

    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();

    const german = ['das Haus', 'der Tisch', 'die Tür'];
    final positions = [
      for (final phrase in german) tester.getTopLeft(find.text(phrase)),
    ];
    expect(positions[0].dy, lessThan(positions[1].dy));
    expect(positions[1].dy, lessThan(positions[2].dy));
    for (final phrase in german) {
      expect(find.bySemanticsLabel('تصویر واژه $phrase'), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('Words searches canonical German and recovers from no results',
      (tester) async {
    await _pumpApp(tester);

    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();

    final search = find.bySemanticsLabel('جست‌وجوی واژه‌های آلمانی و فارسی');
    expect(search, findsOneWidget);
    expect(tester.getSize(search).height, greaterThanOrEqualTo(44));
    expect(find.text('۳ واژه رسمی'), findsOneWidget);

    await tester.enterText(search, 'Tisch');
    await tester.pump();
    expect(tester.widget<TextField>(find.byType(TextField)).textDirection,
        TextDirection.ltr);
    expect(find.text('۱ واژه رسمی'), findsOneWidget);
    expect(find.text('der Tisch'), findsOneWidget);
    expect(find.text('das Haus'), findsNothing);
    expect(find.text('die Tür'), findsNothing);

    await tester.enterText(search, 'خانه');
    await tester.pump();
    expect(tester.widget<TextField>(find.byType(TextField)).textDirection,
        TextDirection.rtl);
    expect(find.text('das Haus'), findsOneWidget);
    expect(find.text('der Tisch'), findsNothing);
    expect(find.text('die Tür'), findsNothing);

    await tester.enterText(search, 'ناموجود');
    await tester.pump();
    expect(find.text('واژه‌ای پیدا نشد.'), findsOneWidget);
    expect(find.text('پاک کردن جست‌وجو'), findsOneWidget);

    await tester.tap(find.text('پاک کردن جست‌وجو'));
    await tester.pump();
    expect(find.text('das Haus'), findsOneWidget);
    expect(find.text('der Tisch'), findsOneWidget);
    expect(find.text('die Tür'), findsOneWidget);
    final searchField = tester.widget<TextField>(find.byType(TextField));
    expect(searchField.controller?.text, '');
    expect(searchField.focusNode?.hasFocus, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Words separates device-local personal entries from official words',
      (tester) async {
    final storage = _MemoryPersonalVocabularyStorage();
    final store = PersonalVocabularyStore(storage: storage);
    await store.save(const [
      PersonalVocabularyEntry(
        id: 'personal-1',
        german: 'der Apfel',
        persian: 'سیب',
      ),
      PersonalVocabularyEntry(
        id: 'personal-2',
        german: 'die Schule',
        persian: 'مدرسه',
      ),
    ]);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: store,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('واژه‌های رسمی'), findsOneWidget);
    expect(find.text('۳ واژه رسمی'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('واژه‌های شخصی این دستگاه'),
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('واژه‌های شخصی این دستگاه'), findsOneWidget);
    expect(find.text('۲ از ۳۰ واژه شخصی'), findsOneWidget);
    expect(find.text('der Apfel'), findsOneWidget);
    expect(find.text('سیب'), findsOneWidget);
    expect(find.text('شخصی'), findsOneWidget);

    final search = find.bySemanticsLabel('جست‌وجوی واژه‌های آلمانی و فارسی');
    await tester.ensureVisible(search);
    await tester.enterText(search, 'Apfel');
    await tester.pump();
    expect(find.text('۰ واژه رسمی'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('der Apfel'),
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('der Apfel'), findsOneWidget);
    expect(find.text('۲ از ۳۰ واژه شخصی'), findsOneWidget);
    expect(find.text('die Schule'), findsNothing);
    expect(find.text('das Haus'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Words persists a valid personal word before showing it',
      (tester) async {
    final storage = _MemoryPersonalVocabularyStorage();
    final store = PersonalVocabularyStore(storage: storage);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: store,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('افزودن واژه شخصی'),
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    final addPersonalWord = find.text('افزودن واژه شخصی');
    await tester.ensureVisible(addPersonalWord);
    await tester.pumpAndSettle();
    await tester.tap(addPersonalWord);
    await tester.pump();
    await tester.enterText(find.bySemanticsLabel('واژه آلمانی'), ' der Apfel ');
    await tester.enterText(find.bySemanticsLabel('معنی فارسی'), ' سیب ');
    final savePersonalWord = find.text('ذخیره روی این دستگاه');
    await tester.ensureVisible(savePersonalWord);
    await tester.pumpAndSettle();
    await tester.tap(savePersonalWord);
    await tester.pumpAndSettle();

    expect(find.text('واژه روی این دستگاه ذخیره شد.'), findsOneWidget);
    expect(find.text('der Apfel'), findsOneWidget);
    expect(find.text('سیب'), findsOneWidget);
    expect(await store.load(), hasLength(1));
    expect((await store.load()).single.german, 'der Apfel');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Words keeps a failed personal save out of the visible list',
      (tester) async {
    final storage = _MemoryPersonalVocabularyStorage()..failWrites = true;
    final store = PersonalVocabularyStore(storage: storage);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: store,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final add = find.text('افزودن واژه شخصی');
    await tester.scrollUntilVisible(
      add,
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.ensureVisible(add);
    await tester.pumpAndSettle();
    await tester.tap(add);
    await tester.pump();
    await tester.enterText(find.bySemanticsLabel('واژه آلمانی'), 'der Apfel');
    await tester.enterText(find.bySemanticsLabel('معنی فارسی'), 'سیب');
    final save = find.text('ذخیره روی این دستگاه');
    await tester.ensureVisible(save);
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();

    expect(find.text('ذخیرهٔ واژه انجام نشد؛ دوباره تلاش کن.'), findsOneWidget);
    expect(await store.load(), isEmpty);
    expect(find.text('۰ از ۳۰ واژه شخصی'), findsOneWidget);
    expect(find.text('شخصی'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Words recovers from a device-local personal-word load failure',
      (tester) async {
    final storage = _MemoryPersonalVocabularyStorage()
      ..readFailuresRemaining = 1;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: PersonalVocabularyStore(storage: storage),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('das Haus'), findsOneWidget);
    final loadError =
        find.textContaining('واژه‌های شخصی این دستگاه خوانده نشد');
    await tester.scrollUntilVisible(
      loadError,
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(loadError, findsOneWidget);
    final retry = find.text('تلاش دوباره برای واژه‌های شخصی');
    await tester.ensureVisible(retry);
    await tester.pumpAndSettle();
    await tester.tap(retry);
    await tester.pumpAndSettle();

    expect(find.textContaining('واژه‌های شخصی این دستگاه خوانده نشد'),
        findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Words keeps personal load failure and retry visible during search',
      (tester) async {
    final storage = _MemoryPersonalVocabularyStorage()
      ..readFailuresRemaining = 1;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: PersonalVocabularyStore(storage: storage),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.bySemanticsLabel('جست‌وجوی واژه‌های آلمانی و فارسی'),
      'ناموجود',
    );
    await tester.pump();

    final retry = find.text('تلاش دوباره برای واژه‌های شخصی');
    await tester.scrollUntilVisible(
      retry,
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.textContaining('واژه‌های شخصی این دستگاه خوانده نشد'),
        findsOneWidget);
    expect(retry, findsOneWidget);
  });

  testWidgets('Words ignores stale personal load completion after retry',
      (tester) async {
    final storage = _SequencedPersonalVocabularyStorage();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: PersonalVocabularyStore(storage: storage),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 5));

    final retry = find.text('تلاش دوباره برای واژه‌های شخصی');
    await tester.scrollUntilVisible(
      retry,
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.ensureVisible(retry);
    await tester.pumpAndSettle();
    await tester.tap(retry);
    await tester.pump();

    expect(storage.reads, hasLength(2));
    storage.reads[0].complete(
      '[{"id":"old","german":"alt","persian":"قدیمی"}]',
    );
    await tester.pump();
    storage.reads[1].complete(
      '[{"id":"new","german":"neu","persian":"جدید"}]',
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('neu'),
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('neu'), findsOneWidget);
    expect(find.text('alt'), findsNothing);
  });

  testWidgets(
      'Words rejects normalized duplicates across official and personal lists',
      (tester) async {
    final storage = _MemoryPersonalVocabularyStorage();
    final store = PersonalVocabularyStore(storage: storage);
    await store.save(const [
      PersonalVocabularyEntry(
        id: 'personal-1',
        german: 'der Apfel',
        persian: 'سیب',
      ),
    ]);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: store,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final add = find.text('افزودن واژه شخصی');
    await tester.scrollUntilVisible(
      add,
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.ensureVisible(add);
    await tester.pumpAndSettle();
    await tester.tap(add);
    await tester.pump();

    final german = find.bySemanticsLabel('واژه آلمانی');
    final persian = find.bySemanticsLabel('معنی فارسی');
    final save = find.text('ذخیره روی این دستگاه');
    await tester.enterText(german, '  DAS   HAUS ');
    await tester.enterText(persian, 'خانه');
    await tester.ensureVisible(save);
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(find.text('این واژه از قبل در فهرست تو هست.'), findsOneWidget);
    expect(await store.load(), hasLength(1));

    await tester.enterText(german, ' Der  APFEL ');
    await tester.ensureVisible(save);
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(find.text('این واژه از قبل در فهرست تو هست.'), findsOneWidget);
    expect(await store.load(), hasLength(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Words enforces the 30-word device-local personal quota',
      (tester) async {
    final storage = _MemoryPersonalVocabularyStorage();
    final store = PersonalVocabularyStore(storage: storage);
    await store.save(List.generate(
      30,
      (index) => PersonalVocabularyEntry(
        id: 'personal-$index',
        german: 'Wort $index',
        persian: 'واژه $index',
      ),
    ));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: WordsScreen(
            startPackRepository: InMemoryStartPackRepository(),
            personalVocabularyStore: store,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final personalCount = find.text('۳۰ از ۳۰ واژه شخصی');
    await tester.scrollUntilVisible(
      personalCount,
      160,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(personalCount, findsOneWidget);

    final quotaNotice = find.text('سقف ۳۰ واژه شخصی این دستگاه پر شده است.');
    await tester.scrollUntilVisible(
      quotaNotice,
      160,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(quotaNotice, findsOneWidget);
    expect(
      tester
          .widget<OutlinedButton>(
            find.widgetWithText(OutlinedButton, 'افزودن واژه شخصی'),
          )
          .onPressed,
      isNull,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('Progress shows only device-local pending answers',
      (tester) async {
    await _pumpApp(tester);

    await tester.tap(find.text('پیشرفت'));
    await tester.pumpAndSettle();

    expect(find.text('پیشرفت'), findsNWidgets(2));
    expect(find.text('۰ پاسخ ذخیره‌شده در این دستگاه'), findsOneWidget);
    expect(
        find.text('هنوز پاسخی در این دستگاه ذخیره نشده است.'), findsOneWidget);
    expect(find.textContaining('همگام'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shell navigation switches Today, Words and Progress content',
      (tester) async {
    await _pumpApp(tester);

    // Words destination: content replaces the Today body, and the shell keeps
    // the single navigation with both inactive labels visible.
    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();
    expect(find.text('واژه‌های شروع'), findsOneWidget);
    expect(find.text('امروز'), findsOneWidget);
    expect(find.text('پیشرفت'), findsOneWidget);

    // Progress destination.
    await tester.tap(find.text('پیشرفت'));
    await tester.pumpAndSettle();
    expect(find.text('۰ پاسخ ذخیره‌شده در این دستگاه'), findsOneWidget);
    expect(find.text('امروز'), findsOneWidget);

    // Back to Today: heading and navigation label both present again.
    await tester.tap(find.text('امروز'));
    await tester.pumpAndSettle();
    expect(find.text('۳ کارت برای مرور امروز آماده است.'), findsOneWidget);
    expect(find.text('امروز'), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Progress refreshes to three device-local answers after grading',
      (tester) async {
    await _pumpApp(tester);

    // The truthful zero state before any grade on this device.
    await tester.tap(find.text('پیشرفت'));
    await tester.pumpAndSettle();
    expect(find.text('۰ پاسخ ذخیره‌شده در این دستگاه'), findsOneWidget);

    // Return to Today and grade all three cards.
    await tester.tap(find.text('امروز'));
    await tester.pumpAndSettle();
    await _completeDailyReview(tester);
    await tester.tap(find.text('بازگشت به امروز'));
    await tester.pumpAndSettle();

    // Progress re-reads the queue when selected again.
    await tester.tap(find.text('پیشرفت'));
    await tester.pumpAndSettle();
    expect(find.text('۳ پاسخ ذخیره‌شده در این دستگاه'), findsOneWidget);
    expect(find.text('۰ پاسخ ذخیره‌شده در این دستگاه'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Words loading, empty, error and retry states stay honest',
      (tester) async {
    // Loading shows descriptive progress semantics before content resolves.
    final gated = _GatedStartPackRepository();
    await _pumpApp(tester, startPackRepository: gated, settle: false);
    await tester.pump(const Duration(milliseconds: 1));

    await tester.tap(find.text('واژه‌ها'));
    await tester.pump();
    expect(find.bySemanticsLabel('در حال آماده‌کردن واژه‌ها'), findsOneWidget);

    gated.gate.complete(await InMemoryStartPackRepository().loadDailySession());
    await tester.pumpAndSettle();
    expect(find.text('das Haus'), findsOneWidget);

    // An empty session reports honestly.
    await _pumpApp(tester, startPackRepository: _EmptyStartPackRepository());
    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();
    expect(find.text('واژه‌ای برای نمایش آماده نیست.'), findsOneWidget);

    // A failed load is descriptive, offers retry, and recovers.
    await _pumpApp(
      tester,
      startPackRepository: _RetryStartPackRepository(failuresBeforeSuccess: 2),
    );
    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();
    expect(find.text('واژه‌ها آماده نشد؛ دوباره تلاش کن.'), findsOneWidget);
    expect(find.text('تلاش دوباره'), findsOneWidget);
    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();
    expect(find.text('das Haus'), findsOneWidget);
    expect(find.text('واژه‌ها آماده نشد؛ دوباره تلاش کن.'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Progress loading, empty, error and retry states stay honest',
      (tester) async {
    // Loading shows descriptive progress semantics before the count resolves.
    final gatedStore = _GatedReviewQueueStore();
    await _pumpApp(
      tester,
      reviewQueue: ReviewQueue(
        store: gatedStore,
        idFactory: () => 'vp-event-a',
      ),
      settle: false,
    );
    await tester.pump(const Duration(milliseconds: 1));

    await tester.tap(find.text('پیشرفت'));
    await tester.pump();
    expect(
      find.bySemanticsLabel('در حال خواندن وضعیت دستگاه'),
      findsOneWidget,
    );

    gatedStore.gate.complete(null);
    await tester.pumpAndSettle();
    expect(find.text('۰ پاسخ ذخیره‌شده در این دستگاه'), findsOneWidget);
    expect(
        find.text('هنوز پاسخی در این دستگاه ذخیره نشده است.'), findsOneWidget);

    // A failed read is descriptive, offers retry, and recovers. The first
    // failure is consumed by Today's truthful pending-count read; Progress
    // then fails its own read and can retry it.
    final retryStore = _RetryReviewQueueStore(failuresBeforeRead: 2);
    await _pumpApp(
      tester,
      reviewQueue: ReviewQueue(
        store: retryStore,
        idFactory: () => 'vp-event-a',
      ),
    );
    await tester.tap(find.text('پیشرفت'));
    await tester.pumpAndSettle();
    expect(
        find.text('وضعیت دستگاه خوانده نشد؛ دوباره تلاش کن.'), findsOneWidget);
    expect(find.text('تلاش دوباره'), findsOneWidget);
    await tester.tap(find.text('تلاش دوباره'));
    await tester.pumpAndSettle();
    expect(find.text('۰ پاسخ ذخیره‌شده در این دستگاه'), findsOneWidget);
    expect(find.text('وضعیت دستگاه خوانده نشد؛ دوباره تلاش کن.'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Words and Progress stay overflow-free on a narrow large-text view',
      (tester) async {
    final personalStore = PersonalVocabularyStore(
      storage: _MemoryPersonalVocabularyStorage(),
    );
    await personalStore.save(const [
      PersonalVocabularyEntry(
        id: 'personal-responsive',
        german: 'die Universität',
        persian: 'دانشگاه',
      ),
    ]);
    await _pumpApp(
      tester,
      size: const Size(320, 480),
      textScaleFactor: 2,
      personalVocabularyStore: personalStore,
    );

    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      find.text('die Tür'),
      100,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('die Tür'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('die Universität'),
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('die Universität'), findsOneWidget);
    final addPersonal = find.text('افزودن واژه شخصی');
    await tester.scrollUntilVisible(
      addPersonal,
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.tap(addPersonal);
    await tester.pump();
    await tester.scrollUntilVisible(
      find.text('ذخیره روی این دستگاه'),
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.bySemanticsLabel('واژه آلمانی'), findsOneWidget);
    expect(find.bySemanticsLabel('معنی فارسی'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('پیشرفت'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.pump();
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Words and Progress reflow without overflow in landscape',
      (tester) async {
    final personalStore = PersonalVocabularyStore(
      storage: _MemoryPersonalVocabularyStorage(),
    );
    await personalStore.save(const [
      PersonalVocabularyEntry(
        id: 'personal-landscape',
        german: 'die Universität',
        persian: 'دانشگاه',
      ),
    ]);
    await _pumpApp(
      tester,
      size: const Size(844, 390),
      personalVocabularyStore: personalStore,
    );

    await tester.tap(find.text('واژه‌ها'));
    await tester.pumpAndSettle();
    expect(find.text('das Haus'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('die Tür'),
      100,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('die Tür'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('die Universität'),
      120,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('words-list')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('die Universität'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('پیشرفت'));
    await tester.pumpAndSettle();
    expect(find.text('۰ پاسخ ذخیره‌شده در این دستگاه'), findsOneWidget);
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('primary action remains discoverable on a short large-text view',
      (tester) async {
    await _pumpApp(
      tester,
      size: const Size(320, 360),
      textScaleFactor: 2,
    );

    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.pump();
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'review keeps German LTR and grade controls readable on a narrow large-text view',
      (tester) async {
    await _pumpApp(
      tester,
      size: const Size(320, 480),
      textScaleFactor: 2,
    );

    await tester.ensureVisible(find.text('شروع مرور'));
    await tester.tap(find.text('شروع مرور'));
    await tester.pumpAndSettle();

    final german = find.text('das Haus');
    expect(german, findsOneWidget);
    expect(Directionality.of(tester.element(german)), TextDirection.ltr);

    await tester.ensureVisible(find.text('نمایش پاسخ'));
    await tester.tap(find.text('نمایش پاسخ'));
    await tester.pumpAndSettle();

    // The media and revealed answer are separate readable surfaces.
    expect(find.byType(Card), findsNWidgets(2));

    for (final label in [
      'دوباره می‌خوانم',
      'سخت بود',
      'بلد بودم',
      'خیلی آسان بود',
    ]) {
      final button = find.text(label);
      await tester.ensureVisible(button);
      expect(tester.getRect(button).height, greaterThan(0));
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'completion shows canonical celebrate Bobo, truthful pending count and a return action',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CompletionScreen(
          pendingCount: 3,
          storageError: null,
          onReturnToToday: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The canonical celebration Bobo exposes a semantic label (LB-DS-003).
    expect(
      find.bySemanticsLabel('بوبو موفقیت تو را جشن می‌گیرد'),
      findsOneWidget,
    );
    // The truthful local pending count is still visible.
    expect(find.text('۳ پاسخ در این دستگاه آماده است.'), findsOneWidget);
    // A single return-to-Today action is present, at least 56px tall.
    expect(find.text('بازگشت به امروز'), findsOneWidget);
    expect(
      tester.getSize(find.byType(FilledButton)).height,
      greaterThanOrEqualTo(56),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'reviewing all three cards and returning lands back on the Today screen',
      (tester) async {
    // Full-path test (PR #73 review): grade all three cards from Today, tap
    // the return action, and verify the Today shell is shown again. This
    // proves ReviewScreen actually pops back to the first route.
    await _pumpApp(tester);

    await _completeDailyReview(tester);

    expect(find.text('آفرین، مرور امروز تمام شد.'), findsOneWidget);

    await tester.tap(find.text('بازگشت به امروز'));
    await tester.pumpAndSettle();

    // Back on the Today shell.
    expect(find.text('شروع مرور'), findsOneWidget);
    expect(find.text('آفرین، مرور امروز تمام شد.'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

/// Grades all three cards to reach the daily-completion surface.
Future<void> _completeDailyReview(WidgetTester tester) async {
  await tester.tap(find.text('شروع مرور'));
  await tester.pumpAndSettle();
  await tester.pump(const Duration(milliseconds: 400));
  expect(find.text('das Haus'), findsOneWidget, reason: 'card 1 shown');

  for (var index = 0; index < 3; index += 1) {
    final reveal = find.text('نمایش پاسخ');
    await tester.ensureVisible(reveal);
    await tester.tap(reveal);
    await tester.pumpAndSettle();
    final remembered = find.text('بلد بودم');
    await tester.ensureVisible(remembered);
    await tester.tap(remembered);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 100));
  }

  expect(find.text('آفرین، مرور امروز تمام شد.'), findsOneWidget);
}

Future<void> _pumpApp(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  double textScaleFactor = 1,
  StartPackRepository? startPackRepository,
  ReviewQueue? reviewQueue,
  PersonalVocabularyStore? personalVocabularyStore,
  SoundPreferenceStore? soundPreferenceStore,
  bool settle = true,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.platformDispatcher.textScaleFactorTestValue = textScaleFactor;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  final ids = ['vp-event-a', 'vp-event-b', 'vp-event-c'].iterator;
  final queue = reviewQueue ??
      ReviewQueue(
        store: ControlledReviewQueueStore(),
        idFactory: () {
          ids.moveNext();
          return ids.current;
        },
      );
  await tester.pumpWidget(
    LearnBoxApp(
      key: UniqueKey(),
      startPackRepository: startPackRepository ?? InMemoryStartPackRepository(),
      reviewQueue: queue,
      personalVocabularyStore: personalVocabularyStore ??
          PersonalVocabularyStore(
            storage: _MemoryPersonalVocabularyStorage(),
          ),
      soundPreferenceStore: soundPreferenceStore ??
          SoundPreferenceStore(storage: InMemorySoundPreferenceStorage()),
      splashDuration: Duration.zero,
    ),
  );
  if (settle) {
    await tester.pumpAndSettle();
  }
}

/// A repository whose session future stays pending until the gate completes.
class _GatedStartPackRepository implements StartPackRepository {
  final Completer<List<StartCard>> gate = Completer<List<StartCard>>();

  @override
  Future<List<StartCard>> loadDailySession() => gate.future;
}

/// A repository that always returns an empty session.
class _EmptyStartPackRepository implements StartPackRepository {
  @override
  Future<List<StartCard>> loadDailySession() async => const [];
}

/// A repository that fails the first [failuresBeforeSuccess] loads.
class _RetryStartPackRepository implements StartPackRepository {
  _RetryStartPackRepository({this.failuresBeforeSuccess = 1});

  final int failuresBeforeSuccess;
  var _calls = 0;
  final _ok = InMemoryStartPackRepository();

  @override
  Future<List<StartCard>> loadDailySession() async {
    _calls += 1;
    if (_calls <= failuresBeforeSuccess) {
      throw StateError('synthetic session failure');
    }
    return _ok.loadDailySession();
  }
}

/// A queue store whose read stays pending until the gate completes.
class _GatedReviewQueueStore implements ReviewQueueStore {
  final Completer<String?> gate = Completer<String?>();

  @override
  Future<String?> read() => gate.future;

  @override
  Future<void> write(String serializedEvents) async {}
}

/// A queue store whose first [failuresBeforeRead] reads fail.
class _RetryReviewQueueStore implements ReviewQueueStore {
  _RetryReviewQueueStore({this.failuresBeforeRead = 1});

  final int failuresBeforeRead;
  var _reads = 0;
  String? value;

  @override
  Future<String?> read() async {
    _reads += 1;
    if (_reads <= failuresBeforeRead) {
      throw StateError('synthetic queue read failure');
    }
    return value;
  }

  @override
  Future<void> write(String serializedEvents) async {
    value = serializedEvents;
  }
}

class _MemoryPersonalVocabularyStorage implements PersonalVocabularyStorage {
  String? value;
  bool failWrites = false;
  int readFailuresRemaining = 0;

  @override
  Future<void> delete() async => value = null;

  @override
  Future<String?> read() async {
    if (readFailuresRemaining > 0) {
      readFailuresRemaining -= 1;
      throw StateError('synthetic personal-word read failure');
    }
    return value;
  }

  @override
  Future<void> write(String value) async {
    if (failWrites) throw StateError('synthetic personal-word write failure');
    this.value = value;
  }
}

class _SequencedPersonalVocabularyStorage implements PersonalVocabularyStorage {
  final reads = <Completer<String?>>[];

  @override
  Future<void> delete() async {}

  @override
  Future<String?> read() {
    final read = Completer<String?>();
    reads.add(read);
    return read.future;
  }

  @override
  Future<void> write(String value) async {}
}
