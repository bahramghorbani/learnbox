'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { loadSyncQueue, saveSyncQueue, type PendingSyncEvent } from '@learnbox/learning-engine';

import { LearnerNav } from './components/LearnerNav';
import { AuthGate } from './components/AuthGate';
import { PronunciationButton } from './components/PronunciationButton';
import { Bobo } from './components/Bobo';
import { OnboardingGoal } from './components/OnboardingGoal';
import { ProgressScreen } from './components/ProgressScreen';

type Grade = 'forgot' | 'hard' | 'remembered' | 'mastered';

type QueuedReview = {
  cardId: string;
  grade: Grade;
  reviewedAt: string;
};

const reviewSyncStorageKey = 'learnbox:review-sync:v1:local-prototype';

const initialSavedWords = [
  { german: 'das Haus', persian: 'خانه', progress: 72 },
  { german: 'die Zeit', persian: 'زمان', progress: 48 },
  { german: 'lernen', persian: 'یاد گرفتن', progress: 31 },
];

const studyItems = [
  {
    article: 'das',
    german: 'das Haus',
    persian: 'خانه',
    hint: 'جایی که زندگی می‌کنیم.',
    exampleGerman: 'Ich komme nach Hause.',
    examplePersian: 'من به خانه برمی‌گردم.',
  },
  {
    article: 'die',
    german: 'die Zeit',
    persian: 'زمان',
    hint: 'چیزی که با آن قرارهایمان را تنظیم می‌کنیم.',
    exampleGerman: 'Die Zeit ist wichtig.',
    examplePersian: 'زمان مهم است.',
  },
  {
    article: '',
    german: 'lernen',
    persian: 'یاد گرفتن',
    hint: 'کاری که با تمرین بهتر می‌شود.',
    exampleGerman: 'Ich lerne jeden Tag Deutsch.',
    examplePersian: 'من هر روز آلمانی یاد می‌گیرم.',
  },
];

const grades: Array<{ id: Grade; label: string; detail: string }> = [
  { id: 'forgot', label: 'فراموش کردم', detail: 'زودتر دوباره می‌بینیمش.' },
  { id: 'hard', label: 'سخت بود', detail: 'با فاصلهٔ کوتاه‌تری برمی‌گردد.' },
  { id: 'remembered', label: 'یادم آمد', detail: 'آفرین، فاصلهٔ مرور بیشتر می‌شود.' },
  { id: 'mastered', label: 'کاملاً بلد بودم', detail: 'عالیه، این واژه دیرتر برمی‌گردد.' },
];

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [learningGoal, setLearningGoal] = useState<'life' | 'career' | 'travel'>('life');
  const [wordQuery, setWordQuery] = useState('');
  const [savedWords, setSavedWords] = useState(initialSavedWords);
  const [addingWord, setAddingWord] = useState(false);
  const [newGerman, setNewGerman] = useState('');
  const [newPersian, setNewPersian] = useState('');
  const [screen, setScreen] = useState<'today' | 'card' | 'complete' | 'progress' | 'words'>(
    'today',
  );
  const [flipped, setFlipped] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [streakDays, setStreakDays] = useState(3);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  useEffect(() => {
    if (!authenticated || typeof window === 'undefined') return;
    setPendingReviewCount(
      loadSyncQueue<QueuedReview>(window.localStorage, reviewSyncStorageKey).length,
    );
  }, [authenticated]);

  const begin = () => {
    setScreen('card');
    setFlipped(false);
    setGrade(null);
    setSessionIndex(0);
  };
  const recordGrade = (nextGrade: Grade) => {
    if (typeof window !== 'undefined') {
      const queue = loadSyncQueue<QueuedReview>(window.localStorage, reviewSyncStorageKey);
      const clientEventId =
        window.crypto?.randomUUID?.() ??
        `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const nextQueue: PendingSyncEvent<QueuedReview>[] = [
        ...queue,
        {
          clientEventId,
          payload: {
            cardId: studyItems[sessionIndex].german,
            grade: nextGrade,
            reviewedAt: new Date().toISOString(),
          },
          attempts: 0,
          nextAttemptAt: new Date(),
        },
      ];
      saveSyncQueue(window.localStorage, reviewSyncStorageKey, nextQueue);
      setPendingReviewCount(nextQueue.length);
    }
    setGrade(nextGrade);
    setReviewedToday((count) => count + 1);

    if (sessionIndex < studyItems.length - 1) {
      setSessionIndex((index) => index + 1);
      setFlipped(false);
      return;
    }

    setStreakDays((days) => Math.max(days, 4));
    setScreen('complete');
  };
  const addPersonalWord = () => {
    if (!newGerman.trim() || !newPersian.trim()) return;
    setSavedWords((words) => [
      { german: newGerman.trim(), persian: newPersian.trim(), progress: 0 },
      ...words,
    ]);
    setNewGerman('');
    setNewPersian('');
    setAddingWord(false);
  };

  if (!authenticated) {
    return <AuthGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  if (!onboarded) {
    return (
      <OnboardingGoal
        selectedGoal={learningGoal}
        onSelectGoal={setLearningGoal}
        onContinue={() => setOnboarded(true)}
      />
    );
  }

  if (screen === 'progress') {
    return (
      <ProgressScreen
        onStartReview={begin}
        onNavigate={(destination) => setScreen(destination)}
        reviewedToday={reviewedToday}
        streakDays={streakDays}
      />
    );
  }

  if (screen === 'words') {
    const visibleWords = savedWords.filter((word) =>
      `${word.german} ${word.persian}`.toLocaleLowerCase().includes(wordQuery.toLocaleLowerCase()),
    );
    return (
      <main className="app-shell words-shell" data-testid="learnbox-words">
        <header className="progress-brand">
          <span className="brand">LearnBox</span>
        </header>
        <section className="words-list" aria-labelledby="words-title">
          <h1 id="words-title">واژه‌های من</h1>
          <button
            className="add-word-button"
            type="button"
            onClick={() => setAddingWord((open) => !open)}
          >
            {addingWord ? 'بستن' : 'افزودن واژه'}
          </button>
          {addingWord ? (
            <form
              className="add-word-form"
              onSubmit={(event) => {
                event.preventDefault();
                addPersonalWord();
              }}
            >
              <label>
                <span>واژهٔ آلمانی</span>
                <input
                  value={newGerman}
                  onChange={(event) => setNewGerman(event.target.value)}
                  dir="ltr"
                />
              </label>
              <label>
                <span>معنی فارسی</span>
                <input value={newPersian} onChange={(event) => setNewPersian(event.target.value)} />
              </label>
              <button className="primary-button" type="submit">
                ذخیره در واژه‌های من
              </button>
            </form>
          ) : null}
          <label className="word-search">
            <span className="sr-only">جست‌وجوی واژه</span>
            <input
              value={wordQuery}
              onChange={(event) => setWordQuery(event.target.value)}
              placeholder="جست‌وجوی واژه"
            />
            <span aria-hidden="true">⌕</span>
          </label>
          <p className="words-count">{visibleWords.length} واژه برای مرور</p>
          <div className="word-rows">
            {visibleWords.map((word) => (
              <button className="word-row" key={word.german} type="button" onClick={begin}>
                <span className="word-meaning">{word.persian}</span>
                <strong lang="de" dir="ltr">
                  {word.german}
                </strong>
                <span
                  className="word-ring"
                  style={{ '--word-progress': `${word.progress}%` } as CSSProperties}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
        <LearnerNav current="words" onNavigate={(destination) => setScreen(destination)} />
      </main>
    );
  }

  if (screen === 'complete') {
    const response = grades.find((item) => item.id === grade);
    return (
      <main className="app-shell" data-testid="learnbox-app">
        <section className="completion" aria-live="polite">
          <Bobo expression="celebrate" className="bobo bobo-completion" priority />
          <p className="eyeline">یک قدم آرام و پیوسته</p>
          <h1>آفرین، ثبت شد.</h1>
          <p>{response?.detail}</p>
          <button className="primary-button" onClick={() => setScreen('today')}>
            بازگشت به امروز
          </button>
          {pendingReviewCount ? (
            <p className="sync-status" role="status">
              {pendingReviewCount} پاسخ برای همگام‌سازی امن نگه‌داری شد.
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  if (screen === 'card') {
    const currentItem = studyItems[sessionIndex];
    const completedCount = sessionIndex;
    const remainingCount = studyItems.length - completedCount;
    return (
      <main className="app-shell" data-testid="learnbox-app">
        <header className="session-header">
          <button className="text-button" onClick={() => setScreen('today')}>
            خروج از جلسه
          </button>
          <span>
            {sessionIndex + 1} از {studyItems.length}
          </span>
        </header>
        <div className="session-track" aria-label="پیشرفت جلسه">
          <span style={{ width: `${(completedCount / studyItems.length) * 100}%` }} />
        </div>
        <p className="session-remaining">{remainingCount} کارت برای تمرین امروز مانده است.</p>
        <section className="study-card">
          {!flipped ? (
            <div className="card-face">
              {currentItem.article ? <span className="article">{currentItem.article}</span> : null}
              <h1 lang="de" dir="ltr">
                {currentItem.german}
              </h1>
              <PronunciationButton text={currentItem.german} />
              {sessionIndex === 0 ? (
                <Image
                  src="/images/haus-card.png"
                  alt="خانه‌ای با سقف سفالی"
                  width={1280}
                  height={960}
                  priority
                />
              ) : (
                <div className={`word-visual word-visual-${sessionIndex}`} aria-hidden="true">
                  <span>{sessionIndex === 1 ? '◷' : '✦'}</span>
                </div>
              )}
              <p className="hint">{currentItem.hint}</p>
              <button className="flip-hint" onClick={() => setFlipped(true)}>
                برای دیدن معنی، کارت را برگردان
              </button>
            </div>
          ) : (
            <div className="card-face card-back">
              <button className="flip-again" onClick={() => setFlipped(false)}>
                برگرداندن کارت
              </button>
              <h1>{currentItem.persian}</h1>
              <div className="example" dir="ltr">
                <strong>{currentItem.exampleGerman}</strong>
                <span dir="rtl">{currentItem.examplePersian}</span>
              </div>
              <p className="instruction">چقدر یادت آمد؟</p>
              <div className="grade-grid" role="group" aria-label="درجهٔ یادآوری">
                {grades.map((item) => (
                  <button
                    key={item.id}
                    className={`grade grade-${item.id}`}
                    onClick={() => recordGrade(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-testid="learnbox-app">
      <header className="brand-row">
        <span className="brand">LearnBox</span>
        <Bobo expression="encourage" className="bobo bobo-header" priority />
      </header>
      <section className="today-intro">
        <p className="eyeline">امروز</p>
        <h1>با چند دقیقه شروع کن</h1>
        <p>مرور کوتاه امروز، مسیر یادگیریت را زنده نگه می‌دارد.</p>
      </section>
      <section className="summary" aria-label="پیشنهاد امروز">
        <div>
          <span>مرورهای امروز</span>
          <strong>{24 - reviewedToday}</strong>
          <small>{reviewedToday ? `${reviewedToday} کارت ثبت شد` : 'منتظر مرور'}</small>
        </div>
        <div>
          <span>کلمهٔ پیشنهادی</span>
          <strong>۱۲</strong>
          <small>جدید برای یادگیری</small>
        </div>
      </section>
      <button className="primary-button" onClick={begin}>
        شروع مرور <span aria-hidden="true">←</span>
      </button>
      <button className="recovery" onClick={begin}>
        <Bobo expression="recovery" className="bobo bobo-recovery" />
        <span>
          <strong>چند روزی از دست رفته؟</strong>از آخرین مرور ادامه بده
        </span>
      </button>
      <section className="progress-note">
        <div className="progress-icon streak-icon" aria-hidden="true">
          ✦
        </div>
        <div>
          <h2>زنجیرهٔ آرام تو</h2>
          <p>هر روزی که برگردی، ادامه می‌دهیم.</p>
          <div className="progress-bar">
            <span style={{ width: `${Math.min(100, streakDays * 10)}%` }} />
          </div>
        </div>
        <span>{streakDays} روز</span>
      </section>
      <LearnerNav current="today" onNavigate={(destination) => setScreen(destination)} />
    </main>
  );
}
