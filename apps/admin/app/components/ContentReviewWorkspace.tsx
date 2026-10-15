'use client';

import React, { useCallback, useEffect, useState } from 'react';

import type { LearningVocabularyItem } from '@learnbox/content-models';

import { AdminSidebar } from './AdminSidebar';
import { useAdminWorkspaceAccess } from './AdminAuthGate';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { faDateTime } from './fa-dates';
import { fa } from './fa-digits';
import {
  createIdempotencyKey,
  fetchWithStepUp,
  readCsrfToken,
  stepUpMessage,
} from './step-up-reauth';

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

/** Reference badge tones: green = done, rose = failed, grey = nothing has happened yet. */
const outcomeBadges: Record<ReviewOutcome, string> = {
  pending: 'b-grey',
  passed: 'b-green',
  failed: 'b-rose',
};

/**
 * The queue status the server actually stores. It was carried in the payload but never shown, so a
 * card already machine-validated looked identical to one nobody has touched.
 */
const queueStatusLabels: Record<ServerQueueItem['status'], string> = {
  auto_validated: 'اعتبارسنجی خودکار',
  needs_review: 'نیازمند بررسی',
};

const queueStatusBadges: Record<ServerQueueItem['status'], string> = {
  auto_validated: 'b-grey',
  needs_review: 'b-amber',
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
  aiReview: ServerAiReview | null;
};

type ServerAiFinding = {
  field: string;
  severity: 'critical' | 'major' | 'minor';
  reason: string;
  suggestion: string;
  source: 'reviewer' | 'validator';
  round: number;
  status: 'resolved' | 'remaining';
};

/** The independent AI reviewer's record for exactly this version (advisory, never a check). */
type ServerAiReview = {
  state: string;
  repaired: boolean;
  repairRounds: number;
  reviewerModel: string | null;
  repairModel: string | null;
  findings: ServerAiFinding[];
};

const severityLabels: Record<ServerAiFinding['severity'], string> = {
  critical: 'بحرانی',
  major: 'مهم',
  minor: 'جزئی',
};

const severityBadges: Record<ServerAiFinding['severity'], string> = {
  critical: 'b-rose',
  major: 'b-amber',
  minor: 'b-grey',
};

const findingStatusLabels: Record<ServerAiFinding['status'], string> = {
  resolved: 'با اصلاح خودکار رفع شد',
  remaining: 'باقی‌مانده؛ نیاز به داوری شما',
};

/** One-line verdict for the AI review: what happened, in the order an editor needs it. */
function aiVerdict(review: ServerAiReview): { text: string; badge: string } {
  const remaining = review.findings.filter((finding) => finding.status === 'remaining').length;
  if (review.state !== 'passed') {
    return { text: 'حل‌نشده — بازبین هوش مصنوعی رد کرد', badge: 'b-rose' };
  }
  if (review.repaired) {
    return {
      text: `پس از ${fa(review.repairRounds)} دور اصلاح خودکار تأیید شد`,
      badge: 'b-amber',
    };
  }
  if (remaining > 0) return { text: 'تأیید با نکتهٔ جزئی', badge: 'b-amber' };
  return { text: 'بدون یافته در بار اول تأیید شد', badge: 'b-green' };
}

/**
 * Shows the independent AI reviewer's findings beside the human gate: field, severity, reason,
 * the suggested fix and whether the automatic repair resolved it. Purely informational — it is
 * never a gate dimension, and approving still needs every human check.
 */
function AiReviewPanel({ review }: { review: ServerAiReview }) {
  const verdict = aiVerdict(review);
  return (
    <section
      className="card review-panel review-ai-panel"
      data-review-panel="ai"
      aria-labelledby="ai-review-panel-title"
    >
      <div className="card-head">
        <h3 className="card-title" id="ai-review-panel-title">
          یافته‌های بازبین هوش مصنوعی
        </h3>
        <span className={`badge ${verdict.badge}`} data-ai-verdict={review.state}>
          {verdict.text}
        </span>
      </div>
      <div className="card-body">
        <p className="review-scope-note">
          این بازبینی مستقل و فقط مشورتی است؛ جای هیچ‌یک از بررسی‌های انسانی را نمی‌گیرد.
          {review.reviewerModel ? (
            <>
              {' '}
              بازبین: <bdi dir="ltr">{review.reviewerModel}</bdi>
            </>
          ) : null}
        </p>
        {review.findings.length === 0 ? (
          <p className="muted-note">بازبین هیچ ایرادی ثبت نکرد.</p>
        ) : (
          <ul className="ai-finding-list">
            {review.findings.map((finding, index) => (
              <li
                key={`${finding.round}-${finding.field}-${index}`}
                data-finding-status={finding.status}
              >
                <div className="ai-finding-head">
                  <span className={`badge ${severityBadges[finding.severity]}`}>
                    {severityLabels[finding.severity]}
                  </span>
                  <span className="keep-latin ai-finding-field">{finding.field}</span>
                  <span
                    className={`badge ${finding.status === 'resolved' ? 'b-green' : 'b-amber'}`}
                  >
                    {findingStatusLabels[finding.status]}
                  </span>
                </div>
                <p>
                  <strong>علت:</strong>{' '}
                  {finding.source === 'validator' ? 'اعتبارسنج LearnBox — ' : ''}
                  {finding.reason}
                </p>
                {finding.suggestion ? (
                  <p>
                    <strong>پیشنهاد اصلاح:</strong> {finding.suggestion}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

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

/**
 * Server-backed review queue. Reads only the authenticated GET /api/content/review payload and
 * submits check and decision mutations with a session CSRF token and per-attempt idempotency
 * keys. Every success label is persisted-server truth; nothing on this screen is derived from a
 * local draft, a fixture or a prototype figure. Review decisions are editorial only — publication
 * is a separate, deliberately disabled step.
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
  const pendingReviewCount = items.filter((item) => item.status === 'needs_review').length;

  async function refreshAfterMutation() {
    await loadQueue(false);
  }

  async function submitCheck(dimension: ReviewDimension, outcome: 'passed' | 'failed') {
    if (!selected || busy !== 'none') return;
    const idempotencyKey = pendingCheckKeys[dimension] ?? createIdempotencyKey();
    const csrfToken = readCsrfToken();
    if (!csrfToken) {
      setNotice({ kind: 'error', text: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' });
      return;
    }
    setPendingCheckKeys((keys) => ({ ...keys, [dimension]: idempotencyKey }));
    setBusy('check');
    setBusyDimension(dimension);
    setNotice({ kind: 'none' });
    try {
      const { response, stepUp } = await fetchWithStepUp('/api/content/review/check', {
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
        setNotice({ kind: 'reauth', text: stepUpMessage(stepUp) });
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
    const idempotencyKey = pendingDecisionKey ?? createIdempotencyKey();
    const csrfToken = readCsrfToken();
    if (!csrfToken) {
      setNotice({ kind: 'error', text: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' });
      return;
    }
    setPendingDecisionKey(idempotencyKey);
    setBusy('decision');
    setNotice({ kind: 'none' });
    try {
      const { response, stepUp } = await fetchWithStepUp('/api/content/review/decision', {
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
        setNotice({ kind: 'reauth', text: stepUpMessage(stepUp) });
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
      <div className="server-review-head">
        <h2 id="server-review-title">صف بررسی سرور</h2>
        {phase === 'ready' ? (
          <span className="muted-note">
            {fa(items.length)} کارت خوانده‌شده از backend مرکزی · {fa(pendingReviewCount)} نیازمند
            بررسی
          </span>
        ) : null}
      </div>

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

      {phase === 'disabled' ? (
        <div data-review-unavailable="true" className="review-state-pad">
          <ErrorState
            tone="amber"
            title="ذخیره‌سازی سرور برای بازبینی محتوا غیرفعال است"
            description="هیچ محتوایی در این حالت نمایش داده نمی‌شود و هیچ تغییری در پایگاه داده ثبت نمی‌شود. این نما با پرچم محیطی فعال می‌شود."
          />
        </div>
      ) : null}
      {phase === 'loading' ? (
        <div className="review-state-pad">
          <LoadingState label="در حال دریافت صف بررسی از سرور…" />
        </div>
      ) : null}
      {phase === 'unauthorized' ? (
        <div className="review-state-pad">
          <ErrorState
            tone="amber"
            title="نشست امن معتبر نیست؛ برای بازبینی سرور دوباره وارد شوید."
            description="صف بررسی فقط با نشست گذرکلید خوانده می‌شود؛ هیچ کارتی بدون آن بارگذاری نمی‌شود."
          />
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className="review-state-pad">
          <ErrorState
            title="صف بررسی از سرور در دسترس نیست."
            description="ارتباط با backend مرکزی برقرار نشد یا پاسخ معتبر نبود. هیچ تصمیمی ثبت نشده است."
            action={
              <button type="button" className="btn" onClick={() => void loadQueue(true)}>
                تلاش دوباره
              </button>
            }
          />
        </div>
      ) : null}
      {phase === 'empty' ? (
        <div className="review-state-pad">
          <EmptyState
            variant="page"
            icon="inbox"
            title="صف بررسی خالی است؛ هیچ کارتی در انتظار بررسی نیست."
            description="کارت‌های تازه پس از تولید یا ورود محتوا در این صف ظاهر می‌شوند."
          />
        </div>
      ) : null}
      {phase === 'ready' && selected ? (
        <div className="review-workspace" data-review-workspace="ready">
          <p className="notice mb" role="note" data-publication="disabled">
            <span>
              صف بررسی سرور خوانده شد؛ تصمیم این پنل فقط سردبیری است و{' '}
              <b>انتشار بسته غیرفعال است</b>.
            </span>
          </p>

          <dl className="review-metrics" aria-label="شمارنده‌های صف بررسی">
            <div className="kpi">
              <dt className="kpi-label">کارت‌های صف</dt>
              <dd className="kpi-value sm" data-review-metric="queue-total">
                {fa(items.length)}
              </dd>
            </div>
            <div className="kpi">
              <dt className="kpi-label">بُعدهای تأییدشدهٔ کارت انتخاب‌شده</dt>
              <dd className="kpi-value sm" data-review-metric="checks-passed">
                {fa(passedDimensions.length)} از {fa(dimensions.length)}
              </dd>
            </div>
            <div className="kpi">
              <dt className="kpi-label">رسانهٔ ثبت‌شدهٔ سرور</dt>
              <dd className="kpi-value sm" data-review-metric="media-count">
                {fa(selected.mediaCount)}
              </dd>
            </div>
          </dl>

          <div className="review-workspace-grid">
            <div
              className="card review-panel review-queue-panel"
              data-review-panel="queue"
              role="group"
              aria-labelledby="review-queue-panel-title"
            >
              <div className="card-head">
                <h3 className="card-title" id="review-queue-panel-title">
                  کارت‌های صف
                </h3>
              </div>
              <div className="card-body">
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
                      <span className="list-grow">
                        <span className="list-title" lang="de" dir="ltr">
                          {item.article ? `${item.article} ${item.lemma}` : item.lemma}
                        </span>
                        <span className="list-sub keep-latin" title={item.contentId}>
                          {item.contentId}
                        </span>
                      </span>
                      <span className={`badge ${queueStatusBadges[item.status]}`}>
                        {queueStatusLabels[item.status]}
                      </span>
                      {item.aiReview ? (
                        <span
                          className={`badge ${aiVerdict(item.aiReview).badge}`}
                          title={aiVerdict(item.aiReview).text}
                        >
                          {item.aiReview.repaired ? 'AI: اصلاح‌شده' : 'AI: بازبینی‌شده'}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="review-center-stack">
              <article
                className="card review-panel review-content-panel"
                data-review-panel="content"
                aria-labelledby="review-content-panel-title"
              >
                <div className="card-head">
                  <h3 className="card-title" id="review-content-panel-title">
                    کارت انتخاب‌شده
                  </h3>
                  <span className="muted-note review-content-id keep-latin">
                    {selected.contentId}
                  </span>
                </div>
                <div className="card-body">
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
                        ? `${fa(selected.mediaCount)} رسانه در محتوای ثبت‌شدهٔ سرور`
                        : 'رسانه‌ای در محتوای ثبت‌شدهٔ سرور نیست.'}
                    </p>
                    <p className="provenance">
                      {providerLabels[
                        selected.sourceProvider as LearningVocabularyItem['source']['provider']
                      ] ?? selected.sourceProvider}
                      {selected.sourceReference ? (
                        <small className="keep-latin"> {selected.sourceReference}</small>
                      ) : null}
                    </p>
                  </div>
                </div>
              </article>

              {selected.aiReview ? <AiReviewPanel review={selected.aiReview} /> : null}
            </div>

            <section
              className="card review-panel review-decision-panel"
              data-review-panel="decision"
              aria-labelledby="server-gate-title"
            >
              <div className="card-head">
                <h3 className="card-title" id="server-gate-title">
                  گیت شش‌بُعدی
                </h3>
                <span className={`badge ${allChecksPassed ? 'b-green' : 'b-amber'}`}>
                  {fa(passedDimensions.length)} از {fa(dimensions.length)}
                </span>
              </div>
              <div className="card-body">
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
                        <span className="list-grow">
                          <span className="list-title">{dimensionLabels[dimension]}</span>
                          {outcome !== 'pending' && check?.reviewedAt ? (
                            <span className="list-sub" title={check.reviewedAt}>
                              {faDateTime(check.reviewedAt)}
                            </span>
                          ) : null}
                        </span>
                        <span className={`badge ${outcomeBadges[outcome]}`}>
                          {outcomeLabels[outcome]}
                        </span>
                        {outcome === 'pending' ? (
                          <span className="server-check-actions">
                            <button
                              type="button"
                              className="btn primary sm"
                              disabled={busy !== 'none'}
                              onClick={() => void submitCheck(dimension, 'passed')}
                            >
                              {isBusy ? 'در حال ثبت…' : 'تأیید'}
                            </button>
                            <button
                              type="button"
                              className="btn sm"
                              disabled={busy !== 'none'}
                              onClick={() => void submitCheck(dimension, 'failed')}
                            >
                              ناموفق
                            </button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <div className="review-actions server-decisions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy !== 'none' || !allChecksPassed}
                    onClick={() => void submitDecision('approve')}
                  >
                    {busy === 'decision' ? 'در حال ثبت…' : 'تأیید نهایی سردبیری'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== 'none'}
                    onClick={() => void submitDecision('return_for_revision')}
                  >
                    بازگرداندن برای اصلاح
                  </button>
                  {!allChecksPassed ? (
                    <p className="hint" role="status">
                      تأیید نهایی فقط پس از تأیید هر شش بُعد در سرور ثبت می‌شود.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
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
    <main className="admin-shell cp-workspace" id="review">
      <AdminSidebar current="home" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>بازبینی محتوا</h1>
            <p className="muted">
              صف بررسی سردبیری روی کارت‌های ثبت‌شدهٔ backend مرکزی. هر تصمیم در سرور ثبت و حسابرسی
              می‌شود.
            </p>
            <p className="hint">
              {serverAuthenticated
                ? 'بازبینی سرور؛ انتشار همچنان غیرفعال'
                : 'محتوا فقط پس از ورود امن نمایش داده می‌شود'}
            </p>
          </div>
          <div className="head-actions">
            <span
              className={serverAuthenticated ? 'chip on' : 'chip'}
              aria-label="وضعیت پنل"
              data-review-session={serverAuthenticated ? 'server-authenticated' : 'signed-out'}
            >
              {serverAuthenticated ? 'ورود امن فعال' : 'بدون ورود'}
            </span>
          </div>
        </div>

        {serverAuthenticated ? (
          <ServerBackedContentReview />
        ) : (
          <div data-review-unavailable="true">
            <ErrorState
              tone="amber"
              title="برای مشاهدهٔ محتوای بازبینی باید با ورود امن وارد شوید."
              description="بدون نشست گذرکلید هیچ کارتی خوانده نمی‌شود و هیچ محتوای یادگیری در بستهٔ مرورگر نیست."
            />
          </div>
        )}
      </section>
    </main>
  );
}
