'use client';

import React, { useCallback, useEffect, useState } from 'react';

import pendingDraftsJson from '../../../../content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json';
import manifest from '../../../../content/packs/learnbox-start/manifest.json';
import verticalSliceDraftsJson from '../../../../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json';
import type { ContentPackManifest, LearningVocabularyItem } from '@learnbox/content-models';

import { AdminSidebar } from './AdminSidebar';
import { useAdminWorkspaceAccess } from './AdminAuthGate';
import { PackReleasePanel } from './PackReleasePanel';
import { ReviewGateSummary } from './ReviewGateSummary';
import { ReviewQueueOverview, type ReviewQueueItem } from './ReviewQueueOverview';
import { SplashReplacementPanel } from './SplashReplacementPanel';

type LocalReviewStatus = 'needs_review' | 'approved' | 'returned';

const statusCopy: Record<LocalReviewStatus, string> = {
  needs_review: 'نیازمند بررسی',
  approved: 'در پیش‌نمایش تأیید شد',
  returned: 'برای اصلاح بازگردانده شد',
};

const partOfSpeechLabels: Record<LearningVocabularyItem['partOfSpeech'], string> = {
  noun: 'اسم',
  verb: 'فعل',
  adjective: 'صفت',
  adverb: 'قید',
  phrase: 'عبارت',
  other: 'سایر',
};

const providerLabels: Record<LearningVocabularyItem['source']['provider'], string> = {
  editorial: 'ویراستاری',
  user: 'کاربر',
  ai_suggestion: 'پیشنهاد هوش مصنوعی',
};

const dimensionLabels: Record<ReviewDimension, string> = {
  german_linguistic: 'بررسی آلمانی',
  persian_translation: 'ترجمهٔ فارسی',
  provenance: 'منشأ و استناد',
  visual: 'بازبینی بصری',
  audio: 'بازبینی صوتی',
  app_flow: 'تست جریان کار',
};

const outcomeLabels: Record<ReviewOutcome, string> = {
  pending: 'در انتظار بررسی',
  passed: 'تأییدشده',
  failed: 'ناموفق',
};

type ReviewDimension =
  'german_linguistic' | 'persian_translation' | 'provenance' | 'visual' | 'audio' | 'app_flow';

type ReviewOutcome = 'pending' | 'passed' | 'failed';

type ServerCheck = {
  dimension: ReviewDimension;
  outcome: ReviewOutcome;
  notes: string | null;
  reviewedAt: string | null;
};

type ServerQueueItem = {
  cardVersionId: string;
  contentId: string;
  lemma: string;
  status: 'auto_validated' | 'needs_review';
  article: string | null;
  partOfSpeech: string;
  persianMeanings: string[];
  essentialInflection: string | null;
  pronunciationIpa: string | null;
  examples: Array<{ german: string; persian: string }>;
  mediaCount: number;
  sourceProvider: string;
  sourceReference: string | null;
  checks: ServerCheck[];
};

type ServerPhase = 'loading' | 'unauthorized' | 'disabled' | 'error' | 'empty' | 'ready';

type ServerNotice =
  | { kind: 'none' }
  | { kind: 'check-success'; text: string }
  | { kind: 'decision-success'; text: string }
  | { kind: 'idempotent'; text: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'incomplete'; text: string }
  | { kind: 'reauth'; text: string }
  | { kind: 'error'; text: string };

const dimensions: ReviewDimension[] = [
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
];

const toPersianDigits = (value: number) =>
  String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

function createClientKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const random = Math.floor(Math.random() * 16);
    const value = part === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function readBrowserCookie(name: string): string | undefined {
  return document.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function toQueueStatus(status: LearningVocabularyItem['status']): ReviewQueueItem['status'] {
  if (status === 'approved') return 'approved';
  if (status === 'needs_review') return 'needs_review';
  return 'returned';
}

function LocalReviewPreview() {
  const [status, setStatus] = useState<LocalReviewStatus>('needs_review');
  const chooseStatus = (nextStatus: LocalReviewStatus) => setStatus(nextStatus);

  const drafts = [
    ...(verticalSliceDraftsJson.items as LearningVocabularyItem[]),
    ...(pendingDraftsJson.items as LearningVocabularyItem[]),
  ];
  const card = drafts.find((item) => item.id === 'start-a1-haus') ?? drafts[0];

  return (
    <>
      <div className="review-layout">
        <ReviewCard card={card} />
        <aside className="review-inspector" aria-label="اطلاعات بررسی">
          <section>
            <h2>وضعیت</h2>
            <p className={`status-line status-${status}`}>● {statusCopy[status]}</p>
          </section>
          <section>
            <h2>منشأ</h2>
            <p className="provenance">{providerLabels[card.source.provider]}</p>
            {card.source.reference ? (
              <small lang="en" dir="ltr">
                {card.source.reference}
              </small>
            ) : null}
          </section>
          <div className="review-actions">
            <button
              className="approve-button"
              type="button"
              onClick={() => chooseStatus('approved')}
            >
              تأیید در پیش‌نمایش
            </button>
            <button
              className="return-button"
              type="button"
              onClick={() => chooseStatus('returned')}
            >
              بازگرداندن برای اصلاح
            </button>
            <p className="prototype-note" role="status">
              تغییر فقط در پیش‌نمایش محلی ثبت می‌شود؛ انتشار واقعی نیازمند ورود امن و ناشر مجاز است.
            </p>
          </div>
        </aside>
      </div>

      <ReviewGateSummary
        checks={dimensions.map((dimension) => ({ dimension, outcome: 'pending' as const }))}
      />
    </>
  );
}

/**
 * Server-backed review queue. Reads only the authenticated GET /api/content/review payload and
 * submits check and decision mutations with a session CSRF token and per-attempt idempotency
 * keys. Every success label is persisted-server truth; local preview state is never presented
 * as persisted. When the server runtime is off (404) the queue falls back to the explicitly
 * labeled local-only preview below.
 */
export function ServerBackedContentReview() {
  const [phase, setPhase] = useState<ServerPhase>('loading');
  const [items, setItems] = useState<ServerQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState<'none' | 'check' | 'decision'>('none');
  const [busyDimension, setBusyDimension] = useState<ReviewDimension | undefined>();
  const [notice, setNotice] = useState<ServerNotice>({ kind: 'none' });
  const [pendingCheckKeys, setPendingCheckKeys] = useState<Record<string, string>>({});
  const [pendingDecisionKey, setPendingDecisionKey] = useState<string>();

  const loadQueue = useCallback(async (reportErrors = true) => {
    try {
      const response = await fetch('/api/content/review', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setPhase('disabled');
        return;
      }
      if (response.status === 401) {
        setPhase('unauthorized');
        return;
      }
      if (!response.ok) throw new Error('queue unavailable');
      const payload = (await response.json()) as { items?: ServerQueueItem[] };
      const queue = Array.isArray(payload.items) ? payload.items : [];
      setItems(queue);
      setPhase(queue.length === 0 ? 'empty' : 'ready');
      setSelectedId((previous) =>
        previous && queue.some((item) => item.cardVersionId === previous)
          ? previous
          : (queue[0]?.cardVersionId ?? undefined),
      );
    } catch {
      if (reportErrors) setPhase('error');
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const selected = items.find((item) => item.cardVersionId === selectedId) ?? items[0];
  const allChecksPassed =
    selected !== undefined &&
    dimensions.every((dimension) =>
      selected.checks.some((check) => check.dimension === dimension && check.outcome === 'passed'),
    );

  async function refreshAfterMutation() {
    await loadQueue(false);
  }

  async function submitCheck(dimension: ReviewDimension, outcome: 'passed' | 'failed') {
    if (!selected || busy !== 'none') return;
    const idempotencyKey = pendingCheckKeys[dimension] ?? createClientKey();
    const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
    if (!csrfToken) {
      setNotice({ kind: 'error', text: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' });
      return;
    }
    setPendingCheckKeys((keys) => ({ ...keys, [dimension]: idempotencyKey }));
    setBusy('check');
    setBusyDimension(dimension);
    setNotice({ kind: 'none' });
    try {
      const response = await fetch('/api/content/review/check', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': csrfToken,
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          cardVersionId: selected.cardVersionId,
          dimension,
          outcome,
        }),
      });
      if (response.status === 428) {
        setNotice({ kind: 'reauth', text: 'احراز هویت مجدد لازم است؛ دوباره وارد شوید.' });
        return;
      }
      if (response.status === 409) {
        setPendingCheckKeys((keys) => {
          const next = { ...keys };
          delete next[dimension];
          return next;
        });
        const payload = (await response.json().catch(() => undefined)) as
          { code?: string; currentStatus?: string } | undefined;
        if (payload?.code === 'not_reviewable') {
          setNotice({
            kind: 'conflict',
            text: `ثبت نشد: وضعیت کارت در سرور «${payload.currentStatus ?? ''}» است و دیگر قابل بررسی نیست.`,
          });
        } else {
          setNotice({
            kind: 'conflict',
            text: 'ثبت نشد: نتیجه یا کلید متفاوتی برای این بُعد قبلاً در سرور ثبت شده است.',
          });
        }
        return;
      }
      if (!response.ok) {
        setNotice({
          kind: 'error',
          text: 'ثبت بررسی در سرور ناموفق بود؛ دوباره تلاش کنید (درخواست تکراری بی‌اثر است).',
        });
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { status?: string } | undefined;
      if (payload?.status === 'idempotent') {
        setNotice({
          kind: 'idempotent',
          text: 'این نتیجه قبلاً در سرور ثبت شده بود؛ ثبت تکراری اعمال نشد.',
        });
      } else {
        setNotice({ kind: 'check-success', text: 'ثبت بررسی در سرور انجام شد.' });
      }
      setPendingCheckKeys((keys) => {
        const next = { ...keys };
        delete next[dimension];
        return next;
      });
      await refreshAfterMutation();
    } catch {
      setNotice({
        kind: 'error',
        text: 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید (کلید یکسان دوباره استفاده می‌شود).',
      });
    } finally {
      setBusy('none');
      setBusyDimension(undefined);
    }
  }

  async function submitDecision(action: 'approve' | 'return_for_revision') {
    if (!selected || busy !== 'none') return;
    const idempotencyKey = pendingDecisionKey ?? createClientKey();
    const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
    if (!csrfToken) {
      setNotice({ kind: 'error', text: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' });
      return;
    }
    setPendingDecisionKey(idempotencyKey);
    setBusy('decision');
    setNotice({ kind: 'none' });
    try {
      const response = await fetch('/api/content/review/decision', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': csrfToken,
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          cardVersionId: selected.cardVersionId,
          action,
        }),
      });
      if (response.status === 428) {
        setNotice({ kind: 'reauth', text: 'احراز هویت مجدد لازم است؛ دوباره وارد شوید.' });
        return;
      }
      if (response.status === 409) {
        const payload = (await response.json().catch(() => undefined)) as
          | { code?: string; pendingDimensions?: ReviewDimension[]; currentStatus?: string }
          | undefined;
        if (payload?.code === 'review_incomplete') {
          setNotice({
            kind: 'incomplete',
            text: `تأیید نهایی ثبت نشد: هنوز ${(payload.pendingDimensions ?? []).length} بُعد بررسی نشده است.`,
          });
        } else if (payload?.code === 'not_reviewable') {
          setNotice({
            kind: 'conflict',
            text: `تصمیم ثبت نشد: وضعیت کارت در سرور «${payload.currentStatus ?? ''}» است.`,
          });
        } else {
          setPendingDecisionKey(undefined);
          setNotice({
            kind: 'conflict',
            text: 'تصمیم ثبت نشد: تصمیم دیگری با همین کلید قبلاً در سرور ثبت شده است.',
          });
        }
        return;
      }
      if (!response.ok) {
        setNotice({
          kind: 'error',
          text: 'ثبت تصمیم در سرور ناموفق بود؛ دوباره تلاش کنید (درخواست تکراری بی‌اثر است).',
        });
        return;
      }
      const payload = (await response.json().catch(() => undefined)) as
        { status?: string } | undefined;
      if (payload?.status === 'idempotent') {
        setNotice({
          kind: 'idempotent',
          text: 'این تصمیم قبلاً در سرور ثبت شده بود؛ ثبت تکراری اعمال نشد.',
        });
      } else {
        setNotice({
          kind: 'decision-success',
          text:
            action === 'approve'
              ? 'تأیید نهایی در سرور ثبت شد؛ کارت از صف بررسی خارج می‌شود.'
              : 'بازگرداندن برای اصلاح در سرور ثبت شد؛ کارت در صف بررسی می‌ماند.',
        });
      }
      setPendingDecisionKey(undefined);
      await refreshAfterMutation();
    } catch {
      setNotice({
        kind: 'error',
        text: 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید (کلید یکسان دوباره استفاده می‌شود).',
      });
    } finally {
      setBusy('none');
    }
  }

  return (
    <section className="server-review" aria-labelledby="server-review-title">
      <h2 id="server-review-title">صف بررسی سرور</h2>
      {phase === 'disabled' ? (
        <>
          <p className="admin-preview-notice" role="status">
            ذخیره‌سازی سرور برای بازبینی محتوا غیرفعال است؛ بخش زیر فقط یک پیش‌نمایش محلی است و هیچ
            تغییری در پایگاه داده ثبت نمی‌کند.
          </p>
          <LocalReviewPreview />
          <ReviewQueueOverview
            batchId="learnbox-start-a1-catalog-35-drafts-v1"
            items={[
              ...(verticalSliceDraftsJson.items as LearningVocabularyItem[]),
              ...(pendingDraftsJson.items as LearningVocabularyItem[]),
            ].map((item) => ({
              id: item.id,
              lemma: item.lemma,
              status: toQueueStatus(item.status),
            }))}
            publicationBlocked
          />
        </>
      ) : null}
      {phase === 'loading' ? (
        <p className="server-review-status" role="status" aria-live="polite">
          در حال دریافت صف بررسی از سرور…
        </p>
      ) : null}
      {phase === 'unauthorized' ? (
        <p className="server-review-status" role="status">
          نشست امن معتبر نیست؛ برای بازبینی سرور دوباره وارد شوید.
        </p>
      ) : null}
      {phase === 'error' ? (
        <div className="server-review-status" role="status">
          <p>صف بررسی از سرور در دسترس نیست.</p>
          <button type="button" className="retry-button" onClick={() => void loadQueue(true)}>
            تلاش دوباره
          </button>
        </div>
      ) : null}
      {phase === 'empty' ? (
        <p className="server-review-status" role="status">
          صف بررسی خالی است؛ هیچ کارتی در انتظار بررسی نیست.
        </p>
      ) : null}
      {phase === 'ready' && selected ? (
        <>
          <div className="server-queue-list" role="group" aria-label="فهرست صف بررسی">
            {items.map((item) => (
              <button
                key={item.cardVersionId}
                type="button"
                className="server-queue-row"
                data-server-selected={item.cardVersionId === selected.cardVersionId}
                aria-pressed={item.cardVersionId === selected.cardVersionId}
                onClick={() => setSelectedId(item.cardVersionId)}
              >
                <span lang="de" dir="ltr">
                  {item.article ? `${item.article} ${item.lemma}` : item.lemma}
                </span>
                <small lang="en" dir="ltr">
                  {item.contentId}
                </small>
              </button>
            ))}
          </div>

          <div className="server-card-detail" lang="de" dir="ltr">
            <h3>{selected.article ? `${selected.article} ${selected.lemma}` : selected.lemma}</h3>
            {selected.essentialInflection ? <p>{selected.essentialInflection}</p> : null}
            {selected.pronunciationIpa ? <p>/{selected.pronunciationIpa}/</p> : null}
          </div>
          <div className="server-card-meanings">
            <p lang="fa">
              {selected.persianMeanings.join('؛ ') || '—'}
              <span className="word-kind">
                {partOfSpeechLabels[
                  selected.partOfSpeech as LearningVocabularyItem['partOfSpeech']
                ] ?? 'سایر'}
              </span>
            </p>
            {selected.examples[0] ? (
              <p>
                <span lang="de" dir="ltr">
                  {selected.examples[0].german}
                </span>{' '}
                <span lang="fa">{selected.examples[0].persian}</span>
              </p>
            ) : null}
            <p>
              {selected.mediaCount > 0
                ? `${toPersianDigits(selected.mediaCount)} رسانه در محتوای ثبت‌شدهٔ سرور`
                : 'رسانه‌ای در محتوای ثبت‌شدهٔ سرور نیست.'}
            </p>
            <p className="provenance">
              {providerLabels[
                selected.sourceProvider as LearningVocabularyItem['source']['provider']
              ] ?? selected.sourceProvider}
              {selected.sourceReference ? (
                <small lang="en" dir="ltr">
                  {' '}
                  {selected.sourceReference}
                </small>
              ) : null}
            </p>
          </div>

          <section className="server-gate" aria-labelledby="server-gate-title">
            <h3 id="server-gate-title">گیت شش‌بُعدی</h3>
            <ul className="review-gate-list">
              {dimensions.map((dimension) => {
                const check = selected.checks.find((entry) => entry.dimension === dimension);
                const outcome = check?.outcome ?? 'pending';
                const isBusy = busy === 'check' && busyDimension === dimension;
                return (
                  <li key={dimension} data-dimension={dimension} data-outcome={outcome}>
                    <span aria-hidden="true">
                      {outcome === 'passed' ? '✓' : outcome === 'failed' ? '!' : '○'}
                    </span>
                    <span>{dimensionLabels[dimension]}</span>
                    <small>{outcomeLabels[outcome]}</small>
                    {outcome === 'pending' ? (
                      <span className="server-check-actions">
                        <button
                          type="button"
                          disabled={busy !== 'none'}
                          onClick={() => void submitCheck(dimension, 'passed')}
                        >
                          {isBusy ? 'در حال ثبت…' : 'تأیید'}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== 'none'}
                          onClick={() => void submitCheck(dimension, 'failed')}
                        >
                          ناموفق
                        </button>
                      </span>
                    ) : (
                      <small lang="en" dir="ltr">
                        {check?.reviewedAt ?? ''}
                      </small>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="review-actions server-decisions">
            <button
              type="button"
              className="approve-button"
              disabled={busy !== 'none' || !allChecksPassed}
              onClick={() => void submitDecision('approve')}
            >
              {busy === 'decision' ? 'در حال ثبت…' : 'تأیید نهایی سردبیری'}
            </button>
            <button
              type="button"
              className="return-button"
              disabled={busy !== 'none'}
              onClick={() => void submitDecision('return_for_revision')}
            >
              بازگرداندن برای اصلاح
            </button>
            {!allChecksPassed ? (
              <p className="prototype-note" role="status">
                تأیید نهایی فقط پس از تأیید هر شش بُعد در سرور ثبت می‌شود.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {notice.kind !== 'none' ? (
        <p
          className="server-review-status"
          data-server-notice={notice.kind}
          role="status"
          aria-live="polite"
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Admin content review workspace. In the authenticated server mode it reads and mutates the
 * persisted review queue; otherwise it is the explicitly labeled local-only preview over the
 * committed drafts. Approve/return actions never publish and never fabricate persisted claims.
 */
export function ContentReviewWorkspace() {
  const access = useAdminWorkspaceAccess();
  const serverAuthenticated = access === 'server-authenticated';

  const drafts = [
    ...(verticalSliceDraftsJson.items as LearningVocabularyItem[]),
    ...(pendingDraftsJson.items as LearningVocabularyItem[]),
  ];
  const queueItems: ReviewQueueItem[] = drafts.map((item) => ({
    id: item.id,
    lemma: item.lemma,
    status: toQueueStatus(item.status),
  }));

  return (
    <main className="admin-shell" id="review">
      <AdminSidebar />
      <section className="admin-workspace">
        <header className="admin-topbar">
          <h1>بازبینی محتوا</h1>
          <div className="editor-identity" aria-label="وضعیت پنل">
            <span className="editor-avatar" aria-hidden="true">
              پ
            </span>
            <span>
              <strong>{serverAuthenticated ? 'ورود امن فعال' : 'پیش‌نمایش محلی'}</strong>
              <small>
                {serverAuthenticated
                  ? 'بازبینی سرور؛ انتشار همچنان غیرفعال'
                  : 'بدون ورود یا دسترسی انتشار'}
              </small>
            </span>
          </div>
        </header>

        {serverAuthenticated ? (
          <ServerBackedContentReview />
        ) : (
          <>
            <p className="admin-preview-notice" role="status">
              بازبینی محتوا در این نسخه پیش‌نمایش است.
              {' قابلیت‌های حساس فقط پس از ورود امن و فعال‌سازی'} مستقل همان قابلیت در سرور در دسترس
              قرار می‌گیرند.
            </p>
            <LocalReviewPreview />
            <ReviewQueueOverview
              batchId="learnbox-start-a1-catalog-35-drafts-v1"
              items={queueItems}
              publicationBlocked
            />
          </>
        )}

        <PackReleasePanel
          manifest={manifest as ContentPackManifest}
          items={drafts}
          actorRole="content_reviewer"
        />
        <SplashReplacementPanel />
      </section>
    </main>
  );
}

function ReviewCard({ card }: { card: LearningVocabularyItem }) {
  const germanLemma =
    card.article && card.partOfSpeech === 'noun' ? `${card.article} ${card.lemma}` : card.lemma;
  const meaning = card.persianMeanings[0] ?? '';
  const example = card.examples[0];
  const hasAttachedMedia = card.media.length > 0;

  return (
    <section className="review-card" aria-labelledby="card-title">
      <div className="review-card-heading">
        <span aria-hidden="true">▣</span>کارت واژگان
      </div>
      <div className="word-section">
        <div>
          <h2 id="card-title" lang="de" dir="ltr">
            {germanLemma}
          </h2>
          {card.essentialInflection ? (
            <p lang="de" dir="ltr">
              {card.essentialInflection}
            </p>
          ) : null}
          {card.pronunciation?.ipa ? (
            <p lang="de" dir="ltr">
              /{card.pronunciation.ipa}/
            </p>
          ) : null}
        </div>
      </div>
      <div className="meaning-section">
        <div>
          <h3>{meaning}</h3>
          <span className="word-kind">{partOfSpeechLabels[card.partOfSpeech]}</span>
        </div>
      </div>
      {example ? (
        <div className="example-section">
          <span>مثال</span>
          <p lang="de" dir="ltr">
            {example.german}
          </p>
          <p>{example.persian}</p>
        </div>
      ) : null}
      <div className="media-section">
        <h3>رسانه‌ها</h3>
        <p>
          {hasAttachedMedia
            ? 'رسانه‌های پیوست این کارت:'
            : 'رسانه‌ای برای این کارت ثبت نشده است؛ تولید و بازبینی رسانه انجام نشده.'}
        </p>
        <div className="media-checks">
          {mediaKinds.map((kind) => (
            <span
              data-media-kind={kind}
              data-media-state={hasAttachedMedia ? 'attached' : 'missing'}
              key={kind}
            >
              {hasAttachedMedia ? '✓' : '○'} {mediaKindLabels[kind]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const mediaKindLabels = {
  image: 'تصویر',
  word_audio: 'صدای واژه',
  sentence_audio: 'صدای مثال',
} as const;

const mediaKinds = ['image', 'word_audio', 'sentence_audio'] as const;
