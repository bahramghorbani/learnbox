'use client';

import React, { useCallback, useEffect, useState } from 'react';

import type { LearningVocabularyItem } from '@learnbox/content-models';

import { AdminSidebar } from './AdminSidebar';
import { useAdminWorkspaceAccess } from './AdminAuthGate';
import { SplashReplacementPanel } from './SplashReplacementPanel';

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
  // Single source of truth: the workspace counters and the approval gate read the same derived set.
  const passedDimensions = selected
    ? dimensions.filter((dimension) =>
        selected.checks.some(
          (check) => check.dimension === dimension && check.outcome === 'passed',
        ),
      )
    : [];
  const allChecksPassed = selected !== undefined && passedDimensions.length === dimensions.length;

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
    <section
      className="server-review"
      data-review-state={phase}
      aria-labelledby="server-review-title"
    >
      <h2 id="server-review-title">صف بررسی سرور</h2>
      {phase === 'disabled' ? (
        <p className="admin-preview-notice" role="status" data-review-unavailable="true">
          ذخیره‌سازی سرور برای بازبینی محتوا غیرفعال است؛ هیچ محتوایی در این حالت نمایش داده نمی‌شود
          و هیچ تغییری در پایگاه داده ثبت نمی‌شود.
        </p>
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
        <div className="review-workspace" data-review-workspace="ready">
          <header className="review-context" data-publication="disabled">
            <p className="review-context-line">
              صف بررسی سرور خوانده شد؛ تصمیم این پنل فقط سردبیری است و انتشار بسته غیرفعال است.
            </p>
            <dl className="review-metrics" aria-label="شمارنده‌های صف بررسی">
              <div>
                <dt>کارت‌های صف</dt>
                <dd data-review-metric="queue-total">{toPersianDigits(items.length)}</dd>
              </div>
              <div>
                <dt>بُعدهای تأییدشدهٔ کارت انتخاب‌شده</dt>
                <dd data-review-metric="checks-passed">
                  {toPersianDigits(passedDimensions.length)} از {toPersianDigits(dimensions.length)}
                </dd>
              </div>
              <div>
                <dt>رسانهٔ ثبت‌شدهٔ سرور</dt>
                <dd data-review-metric="media-count">{toPersianDigits(selected.mediaCount)}</dd>
              </div>
            </dl>
          </header>

          <div className="review-workspace-grid">
            <div
              className="review-panel review-queue-panel"
              data-review-panel="queue"
              role="group"
              aria-labelledby="review-queue-panel-title"
            >
              <h3 id="review-queue-panel-title">کارت‌های صف</h3>
              <div className="server-queue-list">
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
            </div>

            <article
              className="review-panel review-content-panel"
              data-review-panel="content"
              aria-labelledby="review-content-panel-title"
            >
              <h3 id="review-content-panel-title">کارت انتخاب‌شده</h3>
              <p className="review-content-id" lang="en" dir="ltr">
                {selected.contentId}
              </p>
              <div className="server-card-detail" lang="de" dir="ltr">
                <p className="review-word">
                  {selected.article ? `${selected.article} ${selected.lemma}` : selected.lemma}
                </p>
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
            </article>

            <section
              className="review-panel review-decision-panel"
              data-review-panel="decision"
              aria-labelledby="server-gate-title"
            >
              <h3 id="server-gate-title">گیت شش‌بُعدی</h3>
              <p className="review-scope-note">
                تصمیم این پنل فقط سردبیری است؛ انتشار در این نسخه غیرفعال می‌ماند.
              </p>
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
            </section>
          </div>
        </div>
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
 * Admin content review workspace. It renders review content ONLY from the authenticated server
 * queue (GET /api/content/review). LB-B30: no repository draft JSON, manifest or fixture is imported
 * into the client bundle any more, so an anonymous visitor (or a cached HTML/JS asset) can never
 * receive learner card content. Without a signed-in server session the page shows an empty,
 * content-free shell.
 */
export function ContentReviewWorkspace() {
  const access = useAdminWorkspaceAccess();
  const serverAuthenticated = access === 'server-authenticated';

  return (
    <main className="admin-shell" id="home">
      <AdminSidebar current="home" />
      <section className="admin-workspace">
        <header className="admin-topbar">
          <h1>بازبینی محتوا</h1>
          <div className="editor-identity" aria-label="وضعیت پنل">
            <span className="editor-avatar" aria-hidden="true">
              پ
            </span>
            <span>
              <strong>{serverAuthenticated ? 'ورود امن فعال' : 'بدون ورود'}</strong>
              <small>
                {serverAuthenticated
                  ? 'بازبینی سرور؛ انتشار همچنان غیرفعال'
                  : 'محتوا فقط پس از ورود امن نمایش داده می‌شود'}
              </small>
            </span>
          </div>
        </header>

        {serverAuthenticated ? (
          <ServerBackedContentReview />
        ) : (
          <p className="admin-preview-notice" role="status" data-review-unavailable="true">
            برای مشاهدهٔ محتوای بازبینی باید با ورود امن وارد شوید.
          </p>
        )}

        <SplashReplacementPanel />
      </section>
    </main>
  );
}
