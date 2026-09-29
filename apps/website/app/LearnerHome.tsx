'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ProfileScreen } from './components/ProfileScreen';
import { SettingsScreen } from './components/SettingsScreen';
import type { AccountDeletionResult } from './components/DeleteAccountPanel';
import {
  loadSoundPreference,
  saveSoundPreference,
  type SoundPreferenceDurability,
} from './sound-preference';
import { TodayScreen } from './components/TodayScreen';
import { AuthGate } from './components/AuthGate';
import { InviteGate } from './components/InviteGate';
import { resolveInviteGateMode } from './alpha-invite-mode';
import { resolveLearnerAuthMode } from './learner-auth-mode';
import { PronunciationButton } from './components/PronunciationButton';
import { Bobo } from './components/Bobo';
import { OnboardingGoal } from './components/OnboardingGoal';
import { ProgressScreen } from './components/ProgressScreen';
import { SupportivePlusOffer } from './components/SupportivePlusOffer';
import { personalWordLimit } from './product-experience';
import { resolveSupportivePlusOffer } from './paywall';
import { buildStartMediaSources, resolveStartMediaMode, type StartMediaMode } from './start-media';
import { StartMediaVisual } from './components/StartMediaVisual';
import type { StartSliceItem } from './start-slice';
import {
  deriveWebSessionItems,
  fetchWebLearnerState,
  type WebLearnerStateResult,
} from '../lib/learner-state-web-client';
import { flushWebReviewQueue } from '../lib/learner-review-web-sync';
import { fetchWebLearnerProfile } from '../lib/learner-profile-web-client';
import type { LearnerSyncState } from './learner-sync-state';

type Grade = 'forgot' | 'hard' | 'remembered' | 'mastered';
type LearningGoal = 'life' | 'career' | 'travel';
type WordSourceFilter = 'all' | 'official' | 'personal';

type QueuedReview = {
  cardId: string;
  grade: Grade;
  reviewedAt: string;
};

type QueuedPersonalVocabulary = PersonalVocabularyEntry & {
  savedAt: string;
};

const baseReviewSyncStorageKey = 'learnbox:review-sync:v1:local-prototype';
const basePersonalVocabularyStorageKey = 'learnbox:personal-vocabulary:v1:local-prototype';
const basePersonalVocabularySyncStorageKey = 'learnbox:personal-vocabulary-sync:v1:local-prototype';
const baseOnboardingGoalStorageKey = 'learnbox:onboarding-goal:v1:local-prototype';
const baseReviewSessionStorageKey = 'learnbox:review-session:v1:local-prototype';
const baseDailyReviewStorageKey = 'learnbox:daily-review:v1:local-prototype';
import {
  fetchLearnerSummary,
  loadSummaryCache,
  saveSummaryCache,
} from '../lib/learner-summary-client';

const baseLearningStreakStorageKey = 'learnbox:learning-streak:v1:local-prototype';
const temporaryDeviceStorage = createMemoryStorage();

function getDeviceStorage(): DeviceStorage {
  if (typeof window === 'undefined') return temporaryDeviceStorage;
  try {
    return createResilientStorage(window.localStorage, temporaryDeviceStorage);
  } catch {
    return temporaryDeviceStorage;
  }
}

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
  /** Component-test data; never selected or bundled in the release runtime. */
  testStudyItems?: StartSliceItem[];
  inviteFlag?: string;
  profileIdentityFlag?: string;
};

export function LearnerHome({
  hostname,
  otpUiFlag = process.env.NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED,
  privateMediaFlag = process.env.NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED,
  testStudyItems,
  inviteFlag = process.env.NEXT_PUBLIC_LEARNBOX_ALPHA_INVITE_UI_ENABLED,
  profileIdentityFlag = process.env.NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED,
}: LearnerHomeProps = {}) {
  // Force inline: Next.js only inlines direct process.env.NEXT_PUBLIC_* references
  // These constants ensure the values are always available regardless of build tooling
  const resolvedOtpFlag = process.env.NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED ?? otpUiFlag ?? 'true';
  const resolvedInviteFlag =
    process.env.NEXT_PUBLIC_LEARNBOX_ALPHA_INVITE_UI_ENABLED ?? inviteFlag ?? 'false';
  const [serverSyncState, setServerSyncState] = useState<LearnerSyncState>('local-only');
  const [todayGrades, setTodayGrades] = useState<Grade[]>([]);
  const [sessionStartTime] = useState(() => Date.now());
  const [serverLastSyncedAt, setServerLastSyncedAt] = useState<string | null>(null);
  const [serverFaces, setServerFaces] = useState<StartSliceItem[]>([]);
  const [serverSnapshot, setServerSnapshot] = useState<
    Extract<WebLearnerStateResult, { status: 'ok' }>['snapshot'] | null
  >(null);
  const [serverStateOwner, setServerStateOwner] = useState<string | null>(null);
  const authMode = resolveLearnerAuthMode(resolvedOtpFlag);
  const inviteGateMode = resolveInviteGateMode(resolvedInviteFlag);
  const [inviteAccepted, setInviteAccepted] = useState(inviteGateMode === 'local-prototype');
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const activeSessionSubjectRef = useRef<string | null>(null);
  activeSessionSubjectRef.current = authenticated ? sessionUserId : null;
  const serverSession =
    serverSnapshot && authenticated && sessionUserId !== null && serverStateOwner === sessionUserId
      ? deriveWebSessionItems(serverSnapshot, (contentId) =>
          serverFaces.find((face) => face.id === contentId),
        )
      : { items: [], unavailableContentIds: [] };
  const [authChecked, setAuthChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [onboardedKey, setOnboardedKey] = useState<string | null>(null);
  const [learningGoal, setLearningGoal] = useState<LearningGoal>('life');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [wordQuery, setWordQuery] = useState('');
  const [wordSourceFilter, setWordSourceFilter] = useState<WordSourceFilter>('all');
  const [personalWordsState, setPersonalWords] = useState<PersonalVocabularyEntry[]>([]);
  const [personalWordsLoadedKey, setPersonalWordsLoadedKey] = useState<string | null>(null);
  const [pendingPersonalWordSyncCount, setPendingPersonalWordSyncCount] = useState(0);
  const [addingWord, setAddingWord] = useState(false);
  const [newGerman, setNewGerman] = useState('');
  const [newPersian, setNewPersian] = useState('');
  const [personalWordNotice, setPersonalWordNotice] = useState('');
  const [screen, setScreen] = useState<
    'today' | 'card' | 'complete' | 'progress' | 'words' | 'store' | 'profile' | 'settings'
  >('today');
  const [flipped, setFlipped] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [sessionItems, setSessionItems] = useState<StartSliceItem[] | null>(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [resumableSessionIndex, setResumableSessionIndex] = useState<number | null>(null);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [plusOfferDismissed, setPlusOfferDismissed] = useState(false);
  const [startMediaMode, setStartMediaMode] = useState<StartMediaMode>('placeholder');
  const [isRecordingGrade, setIsRecordingGrade] = useState(false);
  const [profileIdentity, setProfileIdentity] = useState<
    | { status: 'loading' }
    | { status: 'ok'; maskedPhone: string }
    | { status: 'error' }
    | { status: 'unavailable' }
  >({ status: 'unavailable' });
  const profileIdentityReadGenerationRef = useRef(0);
  const gradeSubmissionRef = useRef(false);
  const reviewFlushInFlightRef = useRef(false);
  const reviewFlushQueuedRef = useRef(false);
  const requestServerReviewFlushRef = useRef<() => void>(() => undefined);
  const flipHintRef = useRef<HTMLButtonElement>(null);
  const flipAgainRef = useRef<HTMLButtonElement>(null);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  const startReviewRef = useRef<HTMLButtonElement>(null);
  const wordSearchInputRef = useRef<HTMLInputElement>(null);
  const profileHeadingRef = useRef<HTMLHeadingElement>(null);
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const profileGoalRowRef = useRef<HTMLButtonElement>(null);
  const settingsGoalRowRef = useRef<HTMLButtonElement>(null);
  const learningGoalReturnTargetRef = useRef<'profile' | 'settings' | null>(null);
  const profileSettingsRowRef = useRef<HTMLButtonElement>(null);
  const profileSettingsReturnRef = useRef(false);
  const isServerOtp = authMode === 'server-otp';
  const studyItems =
    sessionItems ??
    (serverSyncState === 'server-backed' &&
    (!isServerOtp || (sessionUserId !== null && serverStateOwner === sessionUserId))
      ? serverSession.items.map(({ item }) => item)
      : process.env.NODE_ENV === 'test'
        ? (testStudyItems ?? [])
        : []);
  const remainingTodayReviews = Math.max(0, studyItems.length - reviewedToday);
  // Device queues and personal data must never cross authenticated accounts.
  // Legacy unscoped keys are left intact, not silently claimed by a new user.
  const storageScope = isServerOtp ? `:account:${sessionUserId ?? 'unverified'}` : '';
  const reviewSyncStorageKey = baseReviewSyncStorageKey + storageScope;
  const personalVocabularyStorageKey = basePersonalVocabularyStorageKey + storageScope;
  const personalWords =
    personalWordsLoadedKey === personalVocabularyStorageKey ? personalWordsState : [];
  const personalVocabularySyncStorageKey = basePersonalVocabularySyncStorageKey + storageScope;
  const onboardingGoalStorageKey = baseOnboardingGoalStorageKey + storageScope;
  const reviewSessionStorageKey = baseReviewSessionStorageKey + storageScope;
  const dailyReviewStorageKey = baseDailyReviewStorageKey + storageScope;
  const learningStreakStorageKey = baseLearningStreakStorageKey + storageScope;
  // Offline-display cache of the server summary. Never the origin of a number.
  const summaryCacheStorageKey = `learnbox:summary-cache:v1${storageScope}`;
  const profileIdentityEnabled = profileIdentityFlag === 'true';
  const previousAccountRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isServerOtp || previousAccountRef.current === sessionUserId) return;
    previousAccountRef.current = sessionUserId;
    // A cookie expiry or account switch must not retain the previous learner's
    // in-memory review, identity, metrics, or card session.
    setSessionItems(null);
    setScreen('today');
    setTodayGrades([]);
    setCompletedSessions(0);
    setServerFaces([]);
    setServerSnapshot(null);
    setServerStateOwner(null);
    setServerLastSyncedAt(null);
    setProfileIdentity({ status: 'unavailable' });
    setPendingReviewCount(0);
    setPendingPersonalWordSyncCount(0);
  }, [isServerOtp, sessionUserId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (onboarded && screen === 'profile' && learningGoalReturnTargetRef.current === 'profile') {
      profileGoalRowRef.current?.focus();
      learningGoalReturnTargetRef.current = null;
      return;
    }
    if (onboarded && screen === 'settings' && learningGoalReturnTargetRef.current === 'settings') {
      settingsGoalRowRef.current?.focus();
      learningGoalReturnTargetRef.current = null;
      return;
    }
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && document.contains(activeElement))
      return;

    if (screen === 'card') {
      (flipped ? flipAgainRef : flipHintRef).current?.focus();
      return;
    }
    if (screen === 'complete') {
      completionHeadingRef.current?.focus();
      return;
    }
    if (screen === 'profile') {
      // Returning from Settings restores focus to the row that opened it.
      if (profileSettingsReturnRef.current) {
        profileSettingsRowRef.current?.focus();
        profileSettingsReturnRef.current = false;
        return;
      }
      profileHeadingRef.current?.focus();
      return;
    }
    if (screen === 'settings') {
      settingsHeadingRef.current?.focus();
      return;
    }
    if (screen === 'today') startReviewRef.current?.focus();
  }, [flipped, onboarded, screen, sessionIndex]);

  useEffect(() => {
    if (!authenticated || (isServerOtp && !sessionUserId) || typeof window === 'undefined') return;
    const storage = getDeviceStorage();
    setPendingReviewCount(loadSyncQueue<QueuedReview>(storage, reviewSyncStorageKey).length);
    const savedSession = loadReviewSession(storage, reviewSessionStorageKey);
    if (savedSession && savedSession.nextCardIndex < studyItems.length) {
      setResumableSessionIndex(savedSession.nextCardIndex);
      return;
    }
    if (savedSession) clearReviewSession(storage, reviewSessionStorageKey);
    setResumableSessionIndex(null);
  }, [
    authenticated,
    isServerOtp,
    sessionUserId,
    studyItems.length,
    reviewSyncStorageKey,
    reviewSessionStorageKey,
  ]);

  useEffect(() => {
    if (isServerOtp && (!authenticated || !sessionUserId)) return;
    const storage = getDeviceStorage();
    setPersonalWords(loadPersonalVocabulary(storage, personalVocabularyStorageKey));
    setPendingPersonalWordSyncCount(
      loadSyncQueue<QueuedPersonalVocabulary>(storage, personalVocabularySyncStorageKey).length,
    );
    setPersonalWordsLoadedKey(personalVocabularyStorageKey);
  }, [
    authenticated,
    isServerOtp,
    sessionUserId,
    personalVocabularyStorageKey,
    personalVocabularySyncStorageKey,
  ]);

  // Restore session from cookie on page load — prevents re-login on refresh
  useEffect(() => {
    if (authenticated || !isServerOtp || typeof window === 'undefined') {
      setAuthChecked(true);
      return;
    }
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; userId?: string }) => {
        if (cancelled) return;
        if (data.authenticated && typeof data.userId === 'string' && data.userId.length > 0) {
          setSessionUserId(data.userId);
          setAuthenticated(true);
        }
        setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // OTP success happens after the initial cookie check; bind device state only
  // after the newly issued server session identifies its account.
  useEffect(() => {
    if (!isServerOtp || !authenticated || sessionUserId) return;
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: { authenticated?: boolean; userId?: string }) => {
        if (cancelled) return;
        if (data.authenticated && typeof data.userId === 'string' && data.userId.length > 0)
          setSessionUserId(data.userId);
        else setAuthenticated(false);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, isServerOtp, sessionUserId]);

  // Server-backed accounts: the database is the source of truth for today's count
  // and the streak (LB-B25). Local storage is consulted only when the server is
  // unreachable, and never as the origin of a number.
  const refreshServerSummary = useCallback(async () => {
    if (!isServerOtp || !authenticated || !sessionUserId) return;
    const expectedUserId = sessionUserId;
    const result = await fetchLearnerSummary();
    if (activeSessionSubjectRef.current !== expectedUserId) return;
    const now = new Date();
    if (result.status === 'ok') {
      setReviewedToday(result.summary.reviewedToday);
      setStreakDays(result.summary.streakDays);
      saveSummaryCache(
        getDeviceStorage(),
        summaryCacheStorageKey,
        result.summary,
        getLocalDateKey(now),
      );
      return;
    }
    if (result.status === 'unauthorized') {
      setAuthenticated(false);
      setSessionUserId(null);
      return;
    }
    const cached = loadSummaryCache(
      getDeviceStorage(),
      summaryCacheStorageKey,
      getLocalDateKey(now),
      getPreviousDateKey(now),
    );
    if (cached) {
      setReviewedToday(cached.reviewedToday);
      setStreakDays(cached.streakDays);
    }
  }, [authenticated, isServerOtp, sessionUserId, summaryCacheStorageKey]);

  useEffect(() => {
    if (isServerOtp) {
      // Clear first: never render a previous account's or a stale value while the
      // authoritative answer is in flight.
      setReviewedToday(0);
      setStreakDays(0);
      void refreshServerSummary();
      return;
    }
    const progress = loadDailyReviewProgress(
      getDeviceStorage(),
      dailyReviewStorageKey,
      getLocalDateKey(),
    );
    setReviewedToday(progress?.reviewedCount ?? 0);
  }, [isServerOtp, refreshServerSummary, dailyReviewStorageKey]);

  useEffect(() => {
    if (isServerOtp) return;
    const now = new Date();
    setStreakDays(
      getCurrentStreakDays(
        loadLearningStreak(getDeviceStorage(), learningStreakStorageKey),
        getLocalDateKey(now),
        getPreviousDateKey(now),
      ),
    );
  }, [isServerOtp, learningStreakStorageKey]);

  useEffect(() => {
    if (isServerOtp && (!authenticated || !sessionUserId)) return;
    const storedGoal = readStoredLearningGoal(getDeviceStorage(), onboardingGoalStorageKey);
    setLearningGoal(storedGoal ?? 'life');
    setOnboarded(storedGoal !== null);
    setOnboardedKey(onboardingGoalStorageKey);
  }, [authenticated, isServerOtp, sessionUserId, onboardingGoalStorageKey]);

  useEffect(() => {
    setSoundEnabled(loadSoundPreference());
  }, []);

  useEffect(() => {
    if (personalWordsLoadedKey !== personalVocabularyStorageKey) return;
    savePersonalVocabulary(getDeviceStorage(), personalVocabularyStorageKey, personalWordsState);
  }, [personalWordsState, personalWordsLoadedKey, personalVocabularyStorageKey]);

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

  const applyServerStateResult = useCallback(
    async (result: Awaited<ReturnType<typeof fetchWebLearnerState>>, expectedUserId: string) => {
      if (activeSessionSubjectRef.current !== expectedUserId) return;
      if (result.status === 'ok') {
        try {
          const response = await fetch('/api/learner/cards', { cache: 'no-store' });
          if (!response.ok) throw new Error('cards unavailable');
          const body: unknown = await response.json();
          if (activeSessionSubjectRef.current !== expectedUserId) return;
          if (
            !body ||
            typeof body !== 'object' ||
            !('items' in body) ||
            !Array.isArray(body.items) ||
            !body.items.every(isStartSliceItem)
          )
            throw new Error('invalid card faces');
          setServerFaces(body.items);
        } catch {
          if (activeSessionSubjectRef.current !== expectedUserId) return;
          setServerFaces([]);
          setServerSnapshot(null);
          setServerStateOwner(null);
          setServerSyncState('error');
          return;
        }
        setServerSnapshot(result.snapshot);
        setServerStateOwner(expectedUserId);
        setServerLastSyncedAt(new Date().toISOString());
        setServerSyncState('server-backed');
        return;
      }
      setServerFaces([]);
      setServerSnapshot(null);
      setServerStateOwner(null);
      if (result.status === 'unauthorized') {
        setAuthenticated(false);
        setSessionUserId(null);
        setServerSyncState('local-only');
        return;
      }
      setServerSyncState(
        typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error',
      );
    },
    [],
  );

  useEffect(() => {
    if (!authenticated || !isServerOtp || !sessionUserId || typeof window === 'undefined') return;
    let cancelled = false;
    const readServerState = () => {
      setServerSyncState('loading');
      void fetchWebLearnerState()
        .then((result) => {
          if (cancelled) return;
          void applyServerStateResult(result, sessionUserId);
        })
        .catch(() => {
          if (cancelled) return;
          setServerSyncState('error');
        });
    };
    const goOffline = () => {
      setServerSyncState('offline');
    };
    const goOnline = () => {
      readServerState();
    };
    readServerState();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [authenticated, isServerOtp, sessionUserId, applyServerStateResult]);

  const retryServerStateRead = useCallback(() => {
    if (!authenticated || !isServerOtp || !sessionUserId || typeof window === 'undefined') return;
    setServerSyncState('loading');
    void fetchWebLearnerState()
      .then((result) => applyServerStateResult(result, sessionUserId))
      .catch(() => setServerSyncState('error'));
  }, [authenticated, isServerOtp, sessionUserId, applyServerStateResult]);

  const flushServerReviewQueue = useCallback(() => {
    if (!authenticated || !isServerOtp || !sessionUserId || typeof window === 'undefined') return;
    if (reviewFlushInFlightRef.current) {
      reviewFlushQueuedRef.current = true;
      return;
    }
    reviewFlushInFlightRef.current = true;
    void flushWebReviewQueue({
      storage: getDeviceStorage(),
      key: reviewSyncStorageKey,
      ownerId: sessionUserId,
    })
      .then(
        (result) => {
          if (activeSessionSubjectRef.current !== sessionUserId) return;
          setPendingReviewCount(result.pendingCount);
          if (result.acknowledged) {
            retryServerStateRead();
            void refreshServerSummary();
          }
        },
        () => undefined,
      )
      .finally(() => {
        reviewFlushInFlightRef.current = false;
        if (reviewFlushQueuedRef.current) {
          reviewFlushQueuedRef.current = false;
          requestServerReviewFlushRef.current();
        }
      });
  }, [
    authenticated,
    isServerOtp,
    sessionUserId,
    reviewSyncStorageKey,
    retryServerStateRead,
    refreshServerSummary,
  ]);

  requestServerReviewFlushRef.current = flushServerReviewQueue;

  useEffect(() => {
    if (!authenticated || !isServerOtp || typeof window === 'undefined') return;
    const flush = () => flushServerReviewQueue();
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [authenticated, isServerOtp, flushServerReviewQueue]);

  const readProfileIdentity = useCallback(() => {
    const generation = ++profileIdentityReadGenerationRef.current;
    if (
      !profileIdentityEnabled ||
      !authenticated ||
      !isServerOtp ||
      typeof navigator === 'undefined' ||
      navigator.onLine === false
    ) {
      setProfileIdentity({ status: 'unavailable' });
      return;
    }
    setProfileIdentity({ status: 'loading' });
    void fetchWebLearnerProfile()
      .then((result) => {
        if (generation !== profileIdentityReadGenerationRef.current) return;
        setProfileIdentity(
          result.status === 'ok'
            ? result
            : result.status === 'unavailable'
              ? { status: 'error' }
              : { status: 'unavailable' },
        );
      })
      .catch(() => {
        if (generation === profileIdentityReadGenerationRef.current)
          setProfileIdentity({ status: 'error' });
      });
  }, [authenticated, isServerOtp, profileIdentityEnabled]);

  useEffect(() => {
    if (screen !== 'profile') {
      profileIdentityReadGenerationRef.current += 1;
      return;
    }
    readProfileIdentity();
    const goOffline = () => {
      profileIdentityReadGenerationRef.current += 1;
      setProfileIdentity({ status: 'unavailable' });
    };
    const goOnline = () => readProfileIdentity();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      profileIdentityReadGenerationRef.current += 1;
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [screen, readProfileIdentity]);

  const begin = () => {
    const itemsForSession = studyItems;
    const nextIndex = resumableSessionIndex ?? 0;
    if (!itemsForSession[nextIndex]) return;
    setSessionItems(itemsForSession);
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
  const editLearningGoal = () => {
    if (screen === 'profile' || screen === 'settings') learningGoalReturnTargetRef.current = screen;
    setOnboarded(false);
  };
  const openSettings = () => {
    profileSettingsReturnRef.current = true;
    setScreen('settings');
  };
  const closeSettings = () => setScreen('profile');

  /**
   * LB-B04 account deletion.
   *
   * Sends the deletion request and translates the HTTP outcome into the panel's result type. The
   * request id makes a retry after a dropped connection idempotent rather than a second deletion.
   */
  const requestAccountDeletion = useCallback(
    async (input: { confirmPhone: string; requestId: string }): Promise<AccountDeletionResult> => {
      let response: Response;
      try {
        response = await fetch('/api/learner/account', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(input),
        });
      } catch {
        return { status: 'unavailable' };
      }
      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { deletionId?: string };
        return { status: 'deleted', deletionId: body.deletionId ?? '' };
      }
      // 403 is the deliberate phone-confirmation mismatch; 409 is a refusal to delete this account.
      if (response.status === 403) return { status: 'mismatch' };
      if (response.status === 409) return { status: 'refused' };
      return { status: 'unavailable' };
    },
    [],
  );

  /**
   * Leave this device with no trace of the previous learner, then reload into the
   * signed-out experience.
   *
   * Shared by account deletion and sign-out (LB-B27): in both cases the server
   * session is over and the next person using the device must not see the previous
   * learner's goal, streak or queued review work. Only the device copy is cleared —
   * for a sign-out the learner's data stays intact on the server.
   */
  const clearDeviceLearnerState = useCallback(() => {
    try {
      const storage = window.localStorage;
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key && key.startsWith('learnbox:')) storage.removeItem(key);
      }
    } catch {
      // A browser that denies storage access has nothing device-local to clear.
    }
    window.location.replace('/');
  }, []);

  /**
   * Ends the server session (LB-B27). Returns false when the server did not
   * confirm, so the UI can keep the learner signed in rather than faking a
   * sign-out while the session is still live server-side.
   */
  const handleLogout = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
      });
      return response.status === 204;
    } catch {
      return false;
    }
  }, []);

  const handleToggleSound = useCallback(
    async (enabled: boolean): Promise<SoundPreferenceDurability> => {
      setSoundEnabled(enabled);
      return saveSoundPreference(enabled);
    },
    [],
  );
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
            // The review API accepts the immutable public contentId, not the DB UUID.
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
      if (isServerOtp) flushServerReviewQueue();
    }
    setGrade(nextGrade);
    setTodayGrades((prev) => [...prev, nextGrade]);
    setReviewedToday((count) => {
      const reviewedCount = count + 1;
      // Server accounts show an optimistic count only; the authoritative value
      // arrives from /api/learner/summary once the review is acknowledged.
      if (!isServerOtp) {
        saveDailyReviewProgress(getDeviceStorage(), dailyReviewStorageKey, {
          dateKey: getLocalDateKey(),
          reviewedCount,
        });
      }
      return reviewedCount;
    });
    setStreakDays((current) => {
      if (isServerOtp) return Math.max(current, 1);
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
    setSessionItems(null);
    setResumableSessionIndex(null);
    setCompletedSessions((sessions) => sessions + 1);
    setScreen('complete');
  };
  const addPersonalWord = () => {
    if (!newGerman.trim() || !newPersian.trim()) return;
    if (hasPersonalVocabularyDuplicate(searchableWords, newGerman)) {
      setPersonalWordNotice('این واژه از قبل در فهرست تو هست.');
      return;
    }
    const limit = evaluatePersonalWordLimit(personalWords.length, personalWordLimit);
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

  const canonicalStartWords = (
    authMode === 'server-otp'
      ? serverFaces
      : process.env.NODE_ENV === 'test'
        ? (testStudyItems ?? [])
        : []
  ).map((item) => ({
    german: item.article ? `${item.article} ${item.german}` : item.german,
    persian: item.persian,
    progress: 0,
  }));
  const searchableWords = [...personalWords, ...canonicalStartWords];

  if (!inviteAccepted) {
    return <InviteGate mode={inviteGateMode} onInviteAccepted={() => setInviteAccepted(true)} />;
  }

  if (!authenticated && !authChecked) {
    // Still checking session cookie — show nothing (prevents flash of login screen)
    return null;
  }

  if (!authenticated) {
    return <AuthGate mode={authMode} onAuthenticated={() => setAuthenticated(true)} />;
  }
  if (isServerOtp && (!sessionUserId || onboardedKey !== onboardingGoalStorageKey)) {
    return null;
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
        pendingReviewCount={pendingReviewCount}
      />
    );
  }

  if (screen === 'words') {
    const normalizedQuery = wordQuery.toLocaleLowerCase();
    const matchesQuery = (word: { german: string; persian: string }) =>
      `${word.german} ${word.persian}`.toLocaleLowerCase().includes(normalizedQuery);
    const visibleCanonicalWords =
      wordSourceFilter === 'personal' ? [] : canonicalStartWords.filter(matchesQuery);
    const visiblePersonalWords =
      wordSourceFilter === 'official' ? [] : personalWords.filter(matchesQuery);
    const visibleWordCount = visibleCanonicalWords.length + visiblePersonalWords.length;
    const showCanonicalSection =
      wordSourceFilter !== 'personal' && (visibleCanonicalWords.length > 0 || !wordQuery);
    const showPersonalSection =
      wordSourceFilter !== 'official' && (visiblePersonalWords.length > 0 || !wordQuery);
    return (
      <main className="app-shell words-shell" data-testid="learnbox-words">
        <header className="progress-brand">
          <span className="brand">LearnBox</span>
        </header>
        <section className="words-list" aria-labelledby="words-title">
          <h1 id="words-title">واژه‌های من</h1>
          <p className="words-count">
            {personalWords.length} از {personalWordLimit} واژهٔ شخصی
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
              ref={wordSearchInputRef}
              value={wordQuery}
              onChange={(event) => setWordQuery(event.target.value)}
              placeholder="جست‌وجوی واژه"
            />
            <span aria-hidden="true">⌕</span>
          </label>
          <div className="word-source-filters" role="group" aria-label="فیلتر منبع واژه">
            {(
              [
                ['all', 'همه'],
                ['official', 'رسمی'],
                ['personal', 'شخصی'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className="word-source-filter"
                type="button"
                aria-pressed={wordSourceFilter === value}
                onClick={() => setWordSourceFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="words-count">{visibleWordCount} واژه برای مرور</p>
          {visibleWordCount === 0 && wordQuery ? (
            <div className="words-empty-result">
              <p role="status">واژه‌ای مطابق این جست‌وجو پیدا نشد.</p>
              <button
                className="word-search-clear"
                type="button"
                onClick={() => {
                  setWordQuery('');
                  wordSearchInputRef.current?.focus();
                }}
              >
                پاک کردن جست‌وجو
              </button>
            </div>
          ) : null}
          {showCanonicalSection ? (
            <>
              <h2 className="words-section-title">واژه‌های رسمی</h2>
              <div className="word-rows">
                {visibleCanonicalWords.map((word) => (
                  <button className="word-row" key={word.german} type="button" onClick={begin}>
                    <span className="word-meaning">{word.persian}</span>
                    <strong lang="de" dir="ltr">
                      {word.german}
                    </strong>
                    <span className="word-source">رسمی</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {showPersonalSection ? (
            <>
              <h2 className="words-section-title">واژه‌های شخصی</h2>
              {visiblePersonalWords.length ? (
                <div className="word-rows">
                  {visiblePersonalWords.map((word) => (
                    <button className="word-row" key={word.german} type="button" onClick={begin}>
                      <span className="word-meaning">{word.persian}</span>
                      <strong lang="de" dir="ltr">
                        {word.german}
                      </strong>
                      <span className="word-source">شخصی</span>
                    </button>
                  ))}
                </div>
              ) : !wordQuery ? (
                <p className="words-empty-result" role="status">
                  هنوز واژهٔ شخصی اضافه نکرده‌ای.
                </p>
              ) : null}
            </>
          ) : null}
        </section>
        <LearnerNav current="words" onNavigate={(destination) => setScreen(destination)} />
      </main>
    );
  }

  if (screen === 'profile') {
    return (
      <ProfileScreen
        goal={learningGoal}
        pendingReviewCount={pendingReviewCount}
        // Server sync runs exactly when the session is a real server-backed OTP session.
        syncsToServer={authenticated && isServerOtp}
        identity={profileIdentity}
        onRetryIdentity={readProfileIdentity}
        headingRef={profileHeadingRef}
        goalRowRef={profileGoalRowRef}
        settingsRowRef={profileSettingsRowRef}
        onChooseGoal={editLearningGoal}
        onNavigate={(destination) => setScreen(destination)}
        onOpenSettings={openSettings}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        goal={learningGoal}
        headingRef={settingsHeadingRef}
        goalRowRef={settingsGoalRowRef}
        soundEnabled={soundEnabled}
        onBack={closeSettings}
        onChooseGoal={editLearningGoal}
        onToggleSound={handleToggleSound}
        onDeleteAccount={requestAccountDeletion}
        onAccountDeleted={clearDeviceLearnerState}
        onLogout={handleLogout}
        onLoggedOut={clearDeviceLearnerState}
      />
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
          <h1 ref={completionHeadingRef} tabIndex={-1}>
            آفرین، ثبت شد.
          </h1>
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
        <div className="flip-container" onClick={() => setFlipped(!flipped)}>
          <div className={`flip-inner${flipped ? ' flipped' : ''}`} style={{ minHeight: '340px' }}>
            <div className="card-face card-front">
              <StartMediaVisual contentId={currentItem.id} mode={startMediaMode} />
              <div className="card-front-body">
                <div className="card-tap-hint">👆 برای دیدن معنی لمس کن</div>
                {currentItem.article && (
                  <div className={`card-article-badge art-${currentItem.article}`}>
                    {currentItem.article}
                  </div>
                )}
                <div className="card-word-de" lang="de" dir="ltr">
                  {currentItem.german}
                </div>
                <div className="card-badges">
                  <span className={`card-cefr cefr-${currentItem.cefr?.toLowerCase()}`}>
                    {currentItem.cefr}
                  </span>
                  <span className="card-pos">{currentItem.partOfSpeech}</span>
                </div>
                <div className="card-ipa-row" onClick={(e) => e.stopPropagation()}>
                  <span className="card-ipa" dir="ltr">
                    {currentItem.ipa}
                  </span>
                  <PronunciationButton
                    text={currentItem.german}
                    src={mediaSources.wordAudio}
                    soundEnabled={soundEnabled}
                  />
                </div>
                {currentItem.topicTags?.length > 0 && (
                  <div className="card-tags">
                    {currentItem.topicTags.map((t) => (
                      <span key={t} className="card-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="card-face card-back">
              <div className="card-back-body">
                <div className="card-fa-meanings">{currentItem.persian}</div>
                <div className="card-fa-sep" />
                <div className="card-example-block">
                  <div className="card-ex-de" lang="de" dir="ltr">
                    {currentItem.exampleGerman}
                  </div>
                  <div className="card-ex-fa">{currentItem.examplePersian}</div>
                  <div className="card-ex-audio" onClick={(e) => e.stopPropagation()}>
                    <PronunciationButton
                      text={currentItem.exampleGerman}
                      src={mediaSources.sentenceAudio}
                      soundEnabled={soundEnabled}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>شنیدن جمله</span>
                  </div>
                </div>
                {currentItem.grammarNote && (
                  <div className="card-grammar-box">
                    <div className="card-grammar-icon">💡</div>
                    <div className="card-grammar-text">{currentItem.grammarNote}</div>
                  </div>
                )}
                {currentItem.inflection && (
                  <div className="card-inflection-box">
                    <div className="card-inflection-label">صرف</div>
                    <div className="card-inflection-text" dir="ltr">
                      {currentItem.inflection}
                    </div>
                  </div>
                )}
                <div className="card-definition-box">
                  <div className="card-def-label">تعریف آلمانی</div>
                  <div className="card-def-text" lang="de" dir="ltr">
                    {currentItem.germanDefinition}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {flipped && (
          <>
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
          </>
        )}
      </main>
    );
  }

  return (
    <>
      <TodayScreen
        reviewCount={remainingTodayReviews}
        syncState={
          isServerOtp
            ? serverSyncState === 'server-backed' && serverStateOwner !== sessionUserId
              ? 'loading'
              : serverSyncState
            : 'local-only'
        }
        pendingReviewCount={pendingReviewCount}
        lastSyncedAt={serverLastSyncedAt}
        onRetryServerRead={retryServerStateRead}
        onBrowseWords={() => setScreen('words')}
        onStartReview={begin}
        primaryActionRef={startReviewRef}
        streakDays={streakDays}
        reviewedToday={reviewedToday}
        studyItems={studyItems}
        soundEnabled={soundEnabled}
        onToggleSound={() => handleToggleSound(!soundEnabled)}
        leitnerDist={computeLeitnerDist(todayGrades, studyItems.length)}
        accuracy={computeAccuracy(todayGrades)}
        studyMinutes={Math.round((Date.now() - sessionStartTime) / 60_000)}
        onNavigate={(dest) => setScreen(dest as typeof screen)}
      />
      <LearnerNav current="today" onNavigate={(destination) => setScreen(destination)} />
    </>
  );
}

function readStoredLearningGoal(
  storage: Pick<Storage, 'getItem'>,
  key: string,
): LearningGoal | null {
  try {
    const value = storage.getItem(key);
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

/**
 * Compute a 5-box Leitner distribution from today's grades.
 * Grade mapping: forgot→box1, hard→box2, remembered→box3, mastered→box4/5.
 * Unreviewed items stay in box 1.
 */
function computeLeitnerDist(grades: Grade[], totalItems: number): number[] {
  const dist = [0, 0, 0, 0, 0];
  for (const g of grades) {
    if (g === 'forgot') dist[0]++;
    else if (g === 'hard') dist[1]++;
    else if (g === 'remembered') dist[2]++;
    else if (g === 'mastered') dist[3]++;
  }
  // Unreviewed items go to box 1
  const reviewed = grades.length;
  const unreviewed = Math.max(0, totalItems - reviewed);
  dist[0] += unreviewed;
  return dist;
}

function isStartSliceItem(value: unknown): value is StartSliceItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    [
      'id',
      'article',
      'german',
      'germanDefinition',
      'persian',
      'exampleGerman',
      'examplePersian',
      'ipa',
      'cefr',
      'partOfSpeech',
      'grammarNote',
      'inflection',
    ].every((key) => typeof item[key] === 'string') &&
    Array.isArray(item.topicTags) &&
    item.topicTags.every((tag: unknown) => typeof tag === 'string')
  );
}

/** Compute accuracy percentage from today's grades */
function computeAccuracy(grades: Grade[]): number {
  if (grades.length === 0) return 0;
  const correct = grades.filter((g) => g === 'remembered' || g === 'mastered').length;
  return Math.round((correct / grades.length) * 100);
}
