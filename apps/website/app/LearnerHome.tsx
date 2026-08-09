'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { evaluatePersonalWordLimit } from '@learnbox/billing-core';
import {
  hasPersonalVocabularyDuplicate,
  loadPersonalVocabulary,
  loadSyncQueue,
  createMemoryStorage,
  createResilientStorage,
  getCurrentStreakDays,
  loadDailyReviewProgress,
  loadLearningStreak,
  clearReviewSession,
  loadReviewSession,
  recordLearningStreak,
  saveDailyReviewProgress,
  savePersonalVocabulary,
  saveReviewSession,
  saveSyncQueue,
  type DeviceStorage,
  type PendingSyncEvent,
  type PersonalVocabularyEntry,
} from '@learnbox/learning-engine';

import { LearnerNav } from './components/LearnerNav';
import { AuthGate } from './components/AuthGate';
import { InviteGate } from './components/InviteGate';
import { resolveInviteGateMode } from './alpha-invite-mode';
import { resolveLearnerAuthMode } from './learner-auth-mode';
import { PronunciationButton } from './components/PronunciationButton';
import { Bobo } from './components/Bobo';
import { OnboardingGoal } from './components/OnboardingGoal';
import { ProgressScreen } from './components/ProgressScreen';
import { SupportivePlusOffer } from './components/SupportivePlusOffer';
import { StartMediaVisual } from './components/StartMediaVisual';
import { defaultSuggestedNewWords, personalWordLimit } from './product-experience';
import { resolveSupportivePlusOffer } from './paywall';
import { buildStartMediaSources, resolveStartMediaMode, type StartMediaMode } from './start-media';
import { selectTodayStartSession, stagedStartSlice } from './start-slice';

type Grade = 'forgot' | 'hard' | 'remembered' | 'mastered';
type LearningGoal = 'life' | 'career' | 'travel';

type QueuedReview = {
  cardId: string;
  grade: Grade;
  reviewedAt: string;
};

type QueuedPersonalVocabulary = PersonalVocabularyEntry & {
  savedAt: string;
};

const reviewSyncStorageKey = 'learnbox:review-sync:v1:local-prototype';
const personalVocabularyStorageKey = 'learnbox:personal-vocabulary:v1:local-prototype';
const personalVocabularySyncStorageKey = 'learnbox:personal-vocabulary-sync:v1:local-prototype';
const onboardingGoalStorageKey = 'learnbox:onboarding-goal:v1:local-prototype';
const reviewSessionStorageKey = 'learnbox:review-session:v1:local-prototype';
const dailyReviewStorageKey = 'learnbox:daily-review:v1:local-prototype';
const learningStreakStorageKey = 'learnbox:learning-streak:v1:local-prototype';
const temporaryDeviceStorage = createMemoryStorage();

function getDeviceStorage(): DeviceStorage {
  if (typeof window === 'undefined') return temporaryDeviceStorage;
  try {
    return createResilientStorage(window.localStorage, temporaryDeviceStorage);
  } catch {
    return temporaryDeviceStorage;
  }
}

const initialSavedWords = stagedStartSlice.slice(0, 3).map((item, index) => ({
  german: item.article ? `${item.article} ${item.german}` : item.german,
  persian: item.persian,
  progress: [72, 48, 31][index],
}));

const grades: Array<{ id: Grade; label: string; detail: string }> = [
  { id: 'forgot', label: 'فراموش کردم', detail: 'زودتر دوباره می‌بینیمش.' },
  { id: 'hard', label: 'سخت بود', detail: 'با فاصلهٔ کوتاه‌تری برمی‌گردد.' },
  { id: 'remembered', label: 'یادم آمد', detail: 'آفرین، فاصلهٔ مرور بیشتر می‌شود.' },
  { id: 'mastered', label: 'کاملاً بلد بودم', detail: 'عالیه، این واژه دیرتر برمی‌گردد.' },
];

type LearnerHomeProps = {
  hostname?: string;
  otpUiFlag?: string;
  privateMediaFlag?: string;
  inviteFlag?: string;
};

export function LearnerHome({
  hostname,
  otpUiFlag = process.env.NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED,
  privateMediaFlag = process.env.NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED,
  inviteFlag = process.env.NEXT_PUBLIC_LEARNBOX_ALPHA_INVITE_UI_ENABLED,
}: LearnerHomeProps = {}) {
  const studyItems = selectTodayStartSession();
  const authMode = resolveLearnerAuthMode(otpUiFlag);
  const inviteGateMode = resolveInviteGateMode(inviteFlag);
  const [inviteAccepted, setInviteAccepted] = useState(inviteGateMode === 'local-prototype');
  const [authenticated, setAuthenticated] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [learningGoal, setLearningGoal] = useState<LearningGoal>('life');
  const [wordQuery, setWordQuery] = useState('');
  const [personalWords, setPersonalWords] = useState<PersonalVocabularyEntry[]>([]);
  const [personalWordsLoaded, setPersonalWordsLoaded] = useState(false);
  const [pendingPersonalWordSyncCount, setPendingPersonalWordSyncCount] = useState(0);
  const [addingWord, setAddingWord] = useState(false);
  const [newGerman, setNewGerman] = useState('');
  const [newPersian, setNewPersian] = useState('');
  const [personalWordNotice, setPersonalWordNotice] = useState('');
  const [screen, setScreen] = useState<'today' | 'card' | 'complete' | 'progress' | 'words'>(
    'today',
  );
  const [flipped, setFlipped] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [resumableSessionIndex, setResumableSessionIndex] = useState<number | null>(null);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [plusOfferDismissed, setPlusOfferDismissed] = useState(false);
  const [startMediaMode, setStartMediaMode] = useState<StartMediaMode>('placeholder');
  const [isRecordingGrade, setIsRecordingGrade] = useState(false);
  const gradeSubmissionRef = useRef(false);
  const remainingTodayReviews = Math.max(0, studyItems.length - reviewedToday);

  useEffect(() => {
    if (!authenticated || typeof window === 'undefined') return;
    const storage = getDeviceStorage();
    setPendingReviewCount(loadSyncQueue<QueuedReview>(storage, reviewSyncStorageKey).length);
    const savedSession = loadReviewSession(storage, reviewSessionStorageKey);
    if (savedSession && savedSession.nextCardIndex < studyItems.length) {
      setResumableSessionIndex(savedSession.nextCardIndex);
      return;
    }
    if (savedSession) clearReviewSession(storage, reviewSessionStorageKey);
    setResumableSessionIndex(null);
  }, [authenticated, studyItems.length]);

  useEffect(() => {
    const storage = getDeviceStorage();
    setPersonalWords(loadPersonalVocabulary(storage, personalVocabularyStorageKey));
    setPendingPersonalWordSyncCount(
      loadSyncQueue<QueuedPersonalVocabulary>(storage, personalVocabularySyncStorageKey).length,
    );
    setPersonalWordsLoaded(true);
  }, []);

  useEffect(() => {
    const progress = loadDailyReviewProgress(
      getDeviceStorage(),
      dailyReviewStorageKey,
      getLocalDateKey(),
    );
    setReviewedToday(progress?.reviewedCount ?? 0);
  }, []);

  useEffect(() => {
    const now = new Date();
    setStreakDays(
      getCurrentStreakDays(
        loadLearningStreak(getDeviceStorage(), learningStreakStorageKey),
        getLocalDateKey(now),
        getPreviousDateKey(now),
      ),
    );
  }, []);

  useEffect(() => {
    const storedGoal = readStoredLearningGoal(getDeviceStorage());
    if (!storedGoal) return;
    setLearningGoal(storedGoal);
    setOnboarded(true);
  }, []);

  useEffect(() => {
    if (!personalWordsLoaded) return;
    savePersonalVocabulary(getDeviceStorage(), personalVocabularyStorageKey, personalWords);
  }, [personalWords, personalWordsLoaded]);

  useEffect(() => {
    setStartMediaMode(
      resolveStartMediaMode({
        privateMediaFlag,
        authMode,
        hostname: hostname ?? window.location.hostname,
      }),
    );
  }, [authMode, hostname, privateMediaFlag]);

  useEffect(() => {
    gradeSubmissionRef.current = false;
    setIsRecordingGrade(false);
  }, [screen, sessionIndex]);

  const begin = () => {
    const nextIndex = resumableSessionIndex ?? 0;
    setScreen('card');
    setFlipped(false);
    setGrade(null);
    setSessionIndex(nextIndex);
    saveReviewSession(getDeviceStorage(), reviewSessionStorageKey, { nextCardIndex: nextIndex });
    setResumableSessionIndex(nextIndex);
  };
  const completeOnboarding = () => {
    getDeviceStorage().setItem(onboardingGoalStorageKey, learningGoal);
    setOnboarded(true);
  };
  const queuePersonalVocabularySync = (entry: PersonalVocabularyEntry) => {
    if (typeof window === 'undefined') return;
    const storage = getDeviceStorage();
    const queue = loadSyncQueue<QueuedPersonalVocabulary>(
      storage,
      personalVocabularySyncStorageKey,
    );
    const clientEventId =
      window.crypto?.randomUUID?.() ??
      `personal-word-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nextQueue: PendingSyncEvent<QueuedPersonalVocabulary>[] = [
      ...queue,
      {
        clientEventId,
        payload: { ...entry, savedAt: new Date().toISOString() },
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    ];
    saveSyncQueue(storage, personalVocabularySyncStorageKey, nextQueue);
    setPendingPersonalWordSyncCount(nextQueue.length);
  };
  const recordGrade = (nextGrade: Grade) => {
    if (gradeSubmissionRef.current) return;
    gradeSubmissionRef.current = true;
    setIsRecordingGrade(true);
    if (typeof window !== 'undefined') {
      const storage = getDeviceStorage();
      const queue = loadSyncQueue<QueuedReview>(storage, reviewSyncStorageKey);
      const clientEventId =
        window.crypto?.randomUUID?.() ??
        `review-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const nextQueue: PendingSyncEvent<QueuedReview>[] = [
        ...queue,
        {
          clientEventId,
          payload: {
            cardId: studyItems[sessionIndex].id,
            grade: nextGrade,
            reviewedAt: new Date().toISOString(),
          },
          attempts: 0,
          nextAttemptAt: new Date(),
        },
      ];
      saveSyncQueue(storage, reviewSyncStorageKey, nextQueue);
      setPendingReviewCount(nextQueue.length);
    }
    setGrade(nextGrade);
    setReviewedToday((count) => {
      const reviewedCount = count + 1;
      saveDailyReviewProgress(getDeviceStorage(), dailyReviewStorageKey, {
        dateKey: getLocalDateKey(),
        reviewedCount,
      });
      return reviewedCount;
    });
    setStreakDays(() => {
      const now = new Date();
      return recordLearningStreak(
        getDeviceStorage(),
        learningStreakStorageKey,
        getLocalDateKey(now),
        getPreviousDateKey(now),
      ).days;
    });

    if (sessionIndex < studyItems.length - 1) {
      const nextIndex = sessionIndex + 1;
      saveReviewSession(getDeviceStorage(), reviewSessionStorageKey, { nextCardIndex: nextIndex });
      setResumableSessionIndex(nextIndex);
      setSessionIndex(nextIndex);
      setFlipped(false);
      return;
    }

    clearReviewSession(getDeviceStorage(), reviewSessionStorageKey);
    setResumableSessionIndex(null);
    setCompletedSessions((sessions) => sessions + 1);
    setScreen('complete');
  };
  const addPersonalWord = () => {
    if (!newGerman.trim() || !newPersian.trim()) return;
    if (hasPersonalVocabularyDuplicate(savedWords, newGerman)) {
      setPersonalWordNotice('این واژه از قبل در فهرست تو هست.');
      return;
    }
    const limit = evaluatePersonalWordLimit(savedWords.length, personalWordLimit);
    if (!limit.canAdd) {
      setPersonalWordNotice(
        `فعلاً تا ${personalWordLimit} واژهٔ شخصی می‌توانی اضافه کنی. واژه‌های فعلی‌ات همیشه برای مرور در دسترس‌اند.`,
      );
      return;
    }
    const entry = { german: newGerman.trim(), persian: newPersian.trim(), progress: 0 };
    setPersonalWords((words) => [entry, ...words]);
    queuePersonalVocabularySync(entry);
    setNewGerman('');
    setNewPersian('');
    setAddingWord(false);
    setPersonalWordNotice('');
  };

  const savedWords = [...personalWords, ...initialSavedWords];

  if (!inviteAccepted) {
    return (
      <InviteGate mode={inviteGateMode} onInviteAccepted={() => setInviteAccepted(true)} />
    );
  }

  if (!authenticated) {
    return <AuthGate mode={authMode} onAuthenticated={() => setAuthenticated(true)} />;
  }

  if (!onboarded) {
    return (
      <OnboardingGoal
        selectedGoal={learningGoal}
        onSelectGoal={setLearningGoal}
        onContinue={completeOnboarding}
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
          <p className="words-count">
            {savedWords.length} از {personalWordLimit} واژهٔ شخصی
          </p>
          {pendingPersonalWordSyncCount ? (
            <p className="sync-status" role="status">
              {pendingPersonalWordSyncCount} واژه برای همگام‌سازی امن آماده است.
            </p>
          ) : null}
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
              {personalWordNotice ? <p role="status">{personalWordNotice}</p> : null}
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
    const plusOffer = resolveSupportivePlusOffer({
      activeDays: streakDays,
      learningCycleWords: reviewedToday,
      completedSessions,
      firstCollectionCompleted: false,
      meaningfulProgressReportReceived: false,
    });
    return (
      <main className="app-shell" data-testid="learnbox-app">
        <section className="completion" aria-live="polite">
          <Bobo expression="celebrate" className="bobo bobo-completion" priority />
          <p className="eyeline">یک قدم آرام و پیوسته</p>
          <h1>آفرین، ثبت شد.</h1>
          <p>{response?.detail}</p>
          {!plusOfferDismissed ? (
            <SupportivePlusOffer
              decision={plusOffer}
              onDismiss={() => setPlusOfferDismissed(true)}
            />
          ) : null}
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
    const mediaSources = buildStartMediaSources(currentItem.id, startMediaMode);
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
              <PronunciationButton text={currentItem.german} src={mediaSources.wordAudio} />
              <StartMediaVisual contentId={currentItem.id} mode={startMediaMode} />
              <p className="hint" lang="de" dir="ltr">
                {currentItem.germanDefinition}
              </p>
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
              <PronunciationButton
                text={currentItem.exampleGerman}
                src={mediaSources.sentenceAudio}
              />
              <p className="instruction">چقدر یادت آمد؟</p>
              <div
                className="grade-grid"
                role="group"
                aria-label="درجهٔ یادآوری"
                aria-busy={isRecordingGrade}
              >
                {grades.map((item) => (
                  <button
                    key={item.id}
                    className={`grade grade-${item.id}`}
                    onClick={() => recordGrade(item.id)}
                    disabled={isRecordingGrade}
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
        <p className="staging-note">
          {studyItems.length.toLocaleString('fa-IR')} کارت از بستهٔ آزمایشی Start برای امروز آماده
          است.
        </p>
      </section>
      <section className="summary" aria-label="پیشنهاد امروز">
        <div>
          <span>مرورهای امروز</span>
          <strong>{remainingTodayReviews}</strong>
          <small>
            {reviewedToday
              ? `${reviewedToday} کارت امروز ثبت شد`
              : `${studyItems.length} کارت برای شروع آماده است`}
          </small>
        </div>
        <div>
          <span>کلمهٔ پیشنهادی</span>
          <strong>{defaultSuggestedNewWords}</strong>
          <small>جدید برای یادگیری</small>
        </div>
      </section>
      <button className="primary-button" onClick={begin}>
        {resumableSessionIndex === null ? 'شروع مرور' : 'ادامهٔ مرور'}{' '}
        <span aria-hidden="true">←</span>
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
        <span>{streakDays ? `${streakDays} روز` : 'شروع تازه'}</span>
      </section>
      <LearnerNav current="today" onNavigate={(destination) => setScreen(destination)} />
    </main>
  );
}

function readStoredLearningGoal(storage: Pick<Storage, 'getItem'>): LearningGoal | null {
  try {
    const value = storage.getItem(onboardingGoalStorageKey);
    return value === 'life' || value === 'career' || value === 'travel' ? value : null;
  } catch {
    return null;
  }
}

function getLocalDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPreviousDateKey(now: Date): string {
  const previousDay = new Date(now);
  previousDay.setDate(previousDay.getDate() - 1);
  return getLocalDateKey(previousDay);
}
