'use client';

import React, { useCallback, useEffect, useState } from 'react';

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
  | 'stopped';
type JobStatus = 'queued' | 'running' | 'stopped' | 'completed' | 'needs_attention';

export type PackMediaJob = {
  id: string;
  packId: string;
  status: JobStatus;
  stopRequested: boolean;
  estimatedMaxSeconds: number;
  counts: Record<JobItemStatus, number>;
  items: {
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

function jobProgress(job: PackMediaJob) {
  return job.counts.generated + job.counts.not_needed + job.counts.stopped;
}

function jobNotice(job: PackMediaJob) {
  if (job.status === 'needs_attention')
    return 'یک مورد در وضعیت نامعلوم یا در حال اجرای قبلی است؛ هیچ درخواست دیگری خودکار ارسال نمی‌شود.';
  if (job.status === 'stopped') return 'توقف ثبت شد؛ مورد تازه‌ای شروع نمی‌شود.';
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
  onOpenCard,
  onFinished,
}: {
  packId: string;
  cards: { cardId: string; label: string }[];
  loadState: (cardId: string) => Promise<MediaKindState[] | undefined>;
  loadJob: (packId: string) => Promise<PackMediaJob | undefined>;
  createJob: (packId: string) => Promise<CreateJobResult>;
  stopJob: (jobId: string) => Promise<StopJobResult>;
  onOpenCard: (card: { cardId: string; label: string }) => void;
  onFinished: () => void;
}) {
  const [busy, setBusy] = useState<'scanning' | 'creating' | 'stopping'>();
  const [scanError, setScanError] = useState<string>();
  const [scan, setScan] = useState<PackMediaScan>();
  const [job, setJob] = useState<PackMediaJob>();
  const [jobError, setJobError] = useState<string>();

  const refreshJob = useCallback(async () => {
    try {
      const next = await loadJob(packId);
      setJob(next);
      setJobError(undefined);
      if (
        next?.status === 'completed' ||
        next?.status === 'stopped' ||
        next?.status === 'needs_attention'
      ) {
        onFinished();
      }
    } catch {
      setJobError('خواندن وضعیت اجرای پایدار ناموفق بود.');
    }
  }, [loadJob, onFinished, packId]);

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
    onFinished();
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
  }

  const activeJob = job?.status === 'queued' || job?.status === 'running';
  const blockingJob = activeJob || job?.status === 'needs_attention';
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
            {jobNotice(job)} {faNum(jobProgress(job))} از {faNum(jobItemCount(job))} مورد تعیین
            تکلیف شده‌اند.
          </p>
          <p>
            سقف زمانی برآوردشده: {faNum(job.estimatedMaxSeconds)} ثانیه؛ بر پایهٔ timeoutهای
            تنظیم‌شده و فاصلهٔ {faNum(5)} ثانیه‌ای پس از هر مورد.
          </p>
          {job.status === 'needs_attention' || job.counts.in_progress > 0 ? (
            <p className="notice error">
              {faNum(job.counts.in_progress + job.counts.needs_attention)} مورد نیازمند بررسی مدیر
              است؛ نتیجهٔ provider نامعلوم یا عملیات موجود دوباره ارسال نمی‌شود.
            </p>
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
