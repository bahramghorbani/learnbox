'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { scanPackMedia, type PackMediaItem, type PackMediaScan } from './card-media-bulk';
import type { CardMediaKind, MediaKindState } from './CardMediaPanel';
import { faNum } from './fa-digits';
import { StepUpRefusedError } from './step-up-reauth';

const KIND_LABEL: Record<CardMediaKind, string> = {
  image: 'تصویر',
  word_audio: 'صدای واژه',
  sentence_audio: 'صدای مثال',
};

type JobItemStatus =
  | 'pending'
  | 'leased'
  | 'dispatching'
  | 'generated'
  | 'not_needed'
  | 'in_progress'
  | 'needs_attention'
  | 'deferred'
  | 'stopped';
type JobStatus =
  'queued' | 'running' | 'stopped' | 'completed' | 'completed_with_deferred' | 'needs_attention';

export type PackMediaJob = {
  id: string;
  packId: string;
  status: JobStatus;
  stopRequested: boolean;
  estimatedMaxSeconds: number;
  lastProgressAt: string | null;
  counts: Record<JobItemStatus, number>;
  items: {
    id: string;
    cardId: string;
    kind: CardMediaKind;
    status: JobItemStatus;
    candidateId: string | null;
    detail: string | null;
  }[];
};

type CreateJobResult =
  | { ok: true; status: 'created' | 'existing' | 'nothing_needed'; job?: PackMediaJob }
  | { ok: false; message: string };

type StopJobResult = { ok: true; job: PackMediaJob } | { ok: false; message: string };
type ResolveJobResult = { ok: true; job: PackMediaJob } | { ok: false; message: string };
type ReconcileJobResult =
  { ok: true; job: PackMediaJob; count: number } | { ok: false; message: string };

function countByKind(items: readonly PackMediaItem[]): string {
  return (['image', 'word_audio', 'sentence_audio'] as const)
    .map(
      (kind) => `${KIND_LABEL[kind]}: ${faNum(items.filter((item) => item.kind === kind).length)}`,
    )
    .join('، ');
}

function jobItemCount(job: PackMediaJob) {
  return Object.values(job.counts).reduce((total, count) => total + count, 0);
}

function jobResolvedCount(job: PackMediaJob) {
  return job.counts.generated + job.counts.not_needed;
}

function jobPercent(job: PackMediaJob) {
  const total = jobItemCount(job);
  return total === 0 ? 0 : Math.round((jobResolvedCount(job) / total) * 100);
}

function isTerminalJobStatus(status: JobStatus | undefined) {
  return (
    status === 'completed' ||
    status === 'completed_with_deferred' ||
    status === 'stopped' ||
    status === 'needs_attention'
  );
}

function activeOperation(job: PackMediaJob) {
  const active = job.items.find((item) =>
    ['leased', 'dispatching', 'in_progress'].includes(item.status),
  );
  return active ? `${KIND_LABEL[active.kind]} — ${active.status}` : null;
}

function formatTimestamp(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(
        new Date(value),
      )
    : '—';
}

function attentionDetail(detail: string | null) {
  if (detail === 'provider_timeout' || detail === 'provider_provider_timeout')
    return 'مهلت پاسخ provider تمام شد؛ نتیجهٔ درخواست قبلی نامعلوم است.';
  if (detail === 'dispatch_outcome_unknown')
    return 'پس از ارسال درخواست، نتیجه به‌طور قطعی ثبت نشد.';
  if (detail === 'already_generating') return 'عملیات قبلی هنوز نتیجهٔ قطعی ندارد.';
  return 'نتیجهٔ درخواست قبلی نامعلوم است.';
}

function jobNotice(job: PackMediaJob) {
  if (job.status === 'needs_attention')
    return 'یک مورد در وضعیت نامعلوم یا در حال اجرای قبلی است؛ هیچ درخواست دیگری خودکار ارسال نمی‌شود.';
  if (job.status === 'stopped') return 'توقف ثبت شد؛ مورد تازه‌ای شروع نمی‌شود.';
  if (job.status === 'completed_with_deferred')
    return 'تولید موارد باقی‌مانده پایان یافت، اما مورد موکول‌شده ناقص است و انتشار را مسدود می‌کند.';
  if (job.status === 'completed') return 'اجرا تمام شد؛ پیشنهادها همچنان باید دستی پذیرفته شوند.';
  return 'اجرای تأییدشده روی سرور ادامه دارد؛ بستن صفحه آن را متوقف نمی‌کند.';
}

/**
 * A panel only observes the durable job. The server snapshots and dispatches paid work; this
 * component never calls the single-card generation route or retries an uncertain provider result.
 */
export function PackMediaCompletion({
  packId,
  cards,
  loadState,
  loadJob,
  createJob,
  stopJob,
  resolveJob,
  reconcileJob,
  onOpenCard,
  onFinished,
}: {
  packId: string;
  cards: { cardId: string; label: string }[];
  loadState: (cardId: string) => Promise<MediaKindState[] | undefined>;
  loadJob: (packId: string) => Promise<PackMediaJob | undefined>;
  createJob: (packId: string) => Promise<CreateJobResult>;
  stopJob: (jobId: string) => Promise<StopJobResult>;
  resolveJob?: (
    jobId: string,
    itemId: string,
    action: 'defer' | 'retry',
    reason: string,
    confirmedPotentialDuplicateCharge: boolean,
    confirmedContinuePending: boolean,
  ) => Promise<ResolveJobResult>;
  /** Reconcile deferred items that already have an accepted candidate at the current card version. */
  reconcileJob?: (jobId: string) => Promise<ReconcileJobResult>;
  onOpenCard: (card: { cardId: string; label: string }) => void;
  onFinished: () => void;
}) {
  const [busy, setBusy] = useState<
    'scanning' | 'creating' | 'stopping' | 'resolving' | 'reconciling'
  >();
  const [resolutionReason, setResolutionReason] = useState('');
  const [confirmedPotentialDuplicateCharge, setConfirmedPotentialDuplicateCharge] = useState(false);
  const [confirmedContinuePending, setConfirmedContinuePending] = useState(false);
  const [scanError, setScanError] = useState<string>();
  const [scan, setScan] = useState<PackMediaScan>();
  const [job, setJob] = useState<PackMediaJob>();
  const [jobError, setJobError] = useState<string>();
  const priorJobStatus = useRef<JobStatus | undefined>(undefined);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const refreshJob = useCallback(async () => {
    try {
      const next = await loadJob(packId);
      setJob(next);
      setJobError(undefined);
      const previous = priorJobStatus.current;
      priorJobStatus.current = next?.status;
      // An already-terminal first observation is not a state transition. Treating it as one cleared
      // the existing card table every poll through the parent refresh callback.
      if (previous && !isTerminalJobStatus(previous) && isTerminalJobStatus(next?.status)) {
        onFinishedRef.current();
      }
    } catch {
      setJob(undefined);
      setJobError('خواندن وضعیت اجرای پایدار ناموفق بود.');
    }
  }, [loadJob, packId]);

  useEffect(() => {
    void refreshJob();
    // The job is server-owned. Polling is observation only and cannot extend a session or start work.
    const timer = window.setInterval(() => void refreshJob(), 10_000);
    return () => window.clearInterval(timer);
  }, [refreshJob]);

  async function rescan() {
    setBusy('scanning');
    setScanError(undefined);
    try {
      const next = await scanPackMedia(cards, loadState);
      setScan(next);
    } catch (failure) {
      setScan(undefined);
      setScanError(
        failure instanceof StepUpRefusedError ? failure.message : 'خواندن وضعیت رسانه ناموفق بود.',
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function start() {
    setBusy('creating');
    setJobError(undefined);
    const result = await createJob(packId);
    setBusy(undefined);
    if (!result.ok) {
      setJobError(result.message);
      return;
    }
    setJob(result.job);
    setScan(undefined);
    priorJobStatus.current = result.job?.status;
  }

  async function stop() {
    if (!job) return;
    setBusy('stopping');
    setJobError(undefined);
    const result = await stopJob(job.id);
    setBusy(undefined);
    if (!result.ok) {
      setJobError(result.message);
      return;
    }
    setJob(result.job);
    const previous = priorJobStatus.current;
    priorJobStatus.current = result.job.status;
    if (previous && !isTerminalJobStatus(previous) && isTerminalJobStatus(result.job.status)) {
      onFinishedRef.current();
    }
  }

  async function resolveItem(itemId: string, action: 'defer' | 'retry') {
    if (!job || !resolveJob) return;
    setBusy('resolving');
    setJobError(undefined);
    try {
      const result = await resolveJob(
        job.id,
        itemId,
        action,
        resolutionReason,
        action === 'retry' && confirmedPotentialDuplicateCharge,
        action === 'defer' && confirmedContinuePending,
      );
      if (!result.ok) {
        setJobError(result.message);
        setJob(undefined);
        return;
      }
      setJob(result.job);
      priorJobStatus.current = result.job.status;
      setResolutionReason('');
      setConfirmedPotentialDuplicateCharge(false);
      setConfirmedContinuePending(false);
      if (action === 'defer' && result.job.counts.pending > 0) onFinishedRef.current();
    } catch {
      setJobError('نتیجهٔ رسیدگی خوانده نشد؛ پیش از اقدام دوباره وضعیت را تازه کنید.');
      setJob(undefined);
    } finally {
      setBusy(undefined);
    }
  }

  async function reconcileDeferred() {
    if (!job || !reconcileJob) return;
    setBusy('reconciling');
    setJobError(undefined);
    try {
      const result = await reconcileJob(job.id);
      if (!result.ok) {
        setJobError(result.message);
        return;
      }
      setJob(result.job);
      priorJobStatus.current = result.job.status;
    } catch {
      setJobError('تطابق‌سازی ناموفق بود؛ وضعیت را تازه کنید.');
    } finally {
      setBusy(undefined);
    }
  }

  const activeJob = job?.status === 'queued' || job?.status === 'running';
  const blockingJob =
    activeJob || job?.status === 'needs_attention' || job?.status === 'completed_with_deferred';
  const canStart =
    !blockingJob && !busy && scan && scan.unreadable.length === 0 && scan.needed.length > 0;

  return (
    <div className="notice" role="status" aria-live="polite" data-cp-state="pack-media">
      <div className="row">
        <strong>تکمیل رسانهٔ بسته</strong>
        <button
          className="btn"
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void rescan()}
        >
          {scan ? 'بررسی دوباره' : 'بررسی رسانه‌های لازم'}
        </button>
      </div>
      {busy === 'scanning' ? <p>در حال خواندن وضعیت رسانهٔ کارت‌ها…</p> : null}
      {scanError ? (
        <p className="notice error" role="alert">
          {scanError}
        </p>
      ) : null}
      {jobError ? (
        <p className="notice error" role="alert">
          {jobError}
        </p>
      ) : null}

      {job ? (
        <div data-pack-media="job-progress">
          <p>
            {jobNotice(job)} {faNum(jobResolvedCount(job))} از {faNum(jobItemCount(job))} مورد
            تعیین‌تکلیف شده‌اند ({faNum(jobPercent(job))}٪ واقعی).
          </p>
          <p>
            آماده: {faNum(job.counts.generated)}، نیازی نبود: {faNum(job.counts.not_needed)}، منتظر:
            {faNum(job.counts.pending)}، در حال اجرا:
            {faNum(job.counts.leased + job.counts.dispatching + job.counts.in_progress)}، نیازمند
            رسیدگی:
            {faNum(job.counts.needs_attention)}، موکول‌شده: {faNum(job.counts.deferred)}.
          </p>
          <p>
            عملیات جاری: {activeOperation(job) ?? '—'}؛ آخرین پیشرفت واقعی:{' '}
            {formatTimestamp(job.lastProgressAt)}.
          </p>
          {job.status === 'needs_attention' || job.counts.in_progress > 0 ? (
            <p className="notice error">
              {faNum(job.counts.in_progress + job.counts.needs_attention)} مورد نیازمند بررسی مدیر
              است؛ نتیجهٔ provider نامعلوم یا عملیات موجود دوباره ارسال نمی‌شود.
            </p>
          ) : null}
          {reconcileJob && job.counts.deferred > 0 ? (
            <div data-pack-media="reconcile" className="notice">
              <p>
                موارد موکول‌شده‌ای که قبلاً به‌صورت دستی تأیید شده‌اند (candidate پذیرفته‌شده در
                همان نسخهٔ کارت) می‌توانند به‌عنوان تولیدشده ثبت شوند — بدون ارسال به provider یا
                ساخت مجدد.
              </p>
              <button
                type="button"
                className="btn"
                disabled={Boolean(busy)}
                onClick={() => void reconcileDeferred()}
              >
                {busy === 'reconciling' ? 'در حال تطابق‌سازی…' : 'تطابق‌سازی موارد پذیرفته‌شده'}
              </button>
            </div>
          ) : null}
          {resolveJob &&
          job.items.some(
            (item) => item.status === 'needs_attention' || item.status === 'deferred',
          ) ? (
            <div data-pack-media="resolution" className="notice">
              <p>
                رسیدگی مدیریتی به نتیجهٔ نامعلوم؛ مورد موکول‌شده موفق محسوب نمی‌شود و candidate قبلی
                حفظ می‌شود.
              </p>
              <label htmlFor={`pack-media-reason-${job.id}`}>دلیل ثبت‌شده در حسابرسی</label>
              <textarea
                id={`pack-media-reason-${job.id}`}
                value={resolutionReason}
                maxLength={1200}
                onChange={(event) => setResolutionReason(event.target.value)}
              />
              {job.items
                .filter((item) => item.status === 'needs_attention' || item.status === 'deferred')
                .map((item) => (
                  <div key={item.id}>
                    <p>
                      {KIND_LABEL[item.kind]} — کارت <bdi dir="ltr">{item.cardId}</bdi> —{' '}
                      {item.status === 'deferred' ? 'موکول‌شده' : 'نیازمند رسیدگی'}
                    </p>
                    {item.status === 'needs_attention' ? (
                      <p>{attentionDetail(item.detail)}</p>
                    ) : null}
                    {item.status === 'needs_attention' ? (
                      <>
                        {job.counts.pending > 0 ? (
                          <label>
                            <input
                              type="checkbox"
                              checked={confirmedContinuePending}
                              onChange={(event) =>
                                setConfirmedContinuePending(event.target.checked)
                              }
                            />
                            می‌دانم با موکول‌کردن، فقط {faNum(job.counts.pending)} مورد pending همین
                            job و snapshot ثبت‌شدهٔ آن، پس از فعال‌بودن runner، ادامه می‌یابد؛ این
                            دکمه هیچ درخواست provider ارسال نمی‌کند.
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            Boolean(busy) ||
                            !resolutionReason.trim() ||
                            (job.counts.pending > 0 && !confirmedContinuePending)
                          }
                          onClick={() => void resolveItem(item.id, 'defer')}
                        >
                          موکول‌کردن این مورد و ادامهٔ بقیه
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="notice error">
                          هشدار: نتیجهٔ فراخوانی قبلی معلوم نیست؛ retry ممکن است هزینهٔ دوباره داشته
                          باشد.
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={confirmedPotentialDuplicateCharge}
                            onChange={(event) =>
                              setConfirmedPotentialDuplicateCharge(event.target.checked)
                            }
                          />
                          احتمال هزینهٔ دوباره را فهمیدم و retry این مورد را صریحاً تأیید می‌کنم.
                        </label>
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            Boolean(busy) ||
                            !resolutionReason.trim() ||
                            !confirmedPotentialDuplicateCharge
                          }
                          onClick={() => void resolveItem(item.id, 'retry')}
                        >
                          تأیید retry جداگانهٔ همین مورد
                        </button>
                      </>
                    )}
                  </div>
                ))}
            </div>
          ) : null}
          {activeJob ? (
            <button
              className="btn"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void stop()}
            >
              {busy === 'stopping' ? 'در حال ثبت توقف…' : 'توقف شروع موارد بعدی'}
            </button>
          ) : null}
        </div>
      ) : null}

      {scan && !blockingJob ? (
        <div data-pack-media="estimate">
          <p>
            تأیید، عضویت بسته و نسخهٔ هر کارت را روی سرور snapshot می‌کند. پس از آن بستن صفحه یا
            انقضای نشست اجرای تأییدشده را متوقف نمی‌کند؛ مشاهده و کنترل آن همچنان نیازمند نشست مجاز
            است.
          </p>
          {scan.unreadable.length > 0 ? (
            <p className="notice error" role="alert">
              وضعیت رسانهٔ {faNum(scan.unreadable.length)} کارت خوانده نشد؛ برآورد و ساخت تا بررسی
              دوباره در دسترس نیست.
            </p>
          ) : scan.needed.length > 0 ? (
            <>
              <p>
                برآورد پیش از تأیید: {faNum(scan.needed.length)} فراخوانی پولی (
                {countByKind(scan.needed)}). رسانهٔ معتبر موجود، پیشنهاد آماده و عملیات موجود دوباره
                ساخته نمی‌شوند.
              </p>
              <button
                className="btn primary"
                type="button"
                disabled={!canStart}
                onClick={() => void start()}
              >
                {busy === 'creating'
                  ? 'در حال ثبت اجرای پایدار…'
                  : `تأیید و ساخت ${faNum(scan.needed.length)} مورد`}
              </button>
            </>
          ) : (
            <p>هیچ رسانه‌ای برای ساخت لازم نیست.</p>
          )}
          {scan.generating.length > 0 ? (
            <p>
              {faNum(scan.generating.length)} مورد عملیاتی موجود دارند و تا روشن‌شدن نتیجه دوباره
              ارسال نمی‌شوند.
            </p>
          ) : null}
          {scan.unverifiable.length > 0 ? (
            <p>
              {faNum(scan.unverifiable.length)} رسانهٔ پذیرفته‌شده منشأ قابل‌اثبات ندارد؛ بازسازی
              خودکار انجام نمی‌شود.
            </p>
          ) : null}
        </div>
      ) : null}

      {scan && scan.awaitingAcceptance.length > 0 && !busy ? (
        <div data-pack-media="acceptance">
          <p>منتظر پذیرش شما ({faNum(scan.awaitingAcceptance.length)}):</p>
          <ul>
            {scan.awaitingAcceptance.map((item) => (
              <li key={`${item.cardId}-${item.kind}`}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => onOpenCard({ cardId: item.cardId, label: item.label })}
                >
                  <bdi dir="ltr">{item.label}</bdi> — {KIND_LABEL[item.kind]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
