'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { CpModal } from './ContentPackForms';
import type {
  ImportAnalysis,
  ImportAnalysisRow,
  ImportRowClassification,
} from './ContentImportModal';

/**
 * Phase 1 / Milestone 1.4 — the AI pack generation experience.
 *
 * Built from the existing Content & Packs visual language (`CpModal`, `cp-*` classes, the import
 * modal's classification badges), because a generated card and an imported card are reviewed on
 * exactly the same terms.
 *
 * Every state below is driven by real server state: `planning` and `generating` reflect requests
 * actually in flight, and the progress figure is the number of cards the provider has really
 * returned so far. There is no timer, no simulated percentage and no optimistic success state.
 */

export type GenerationStage =
  'prompt' | 'planning' | 'plan' | 'generating' | 'review' | 'accepted' | 'failed';

export interface GenerationPlanView {
  packId: string;
  title: string;
  description: string;
  audience: string;
  cefr: string;
  cardCount: number;
  requestedCount: number;
  topics: string[];
  strategy: string;
  fields: string[];
  scope: string;
}

export interface GenerationJobView {
  jobId: string;
  status: 'planned' | 'generating' | 'generated' | 'accepted' | 'failed';
  prompt: string;
  plan: GenerationPlanView;
  planFingerprint: string;
  provider?: string;
  model?: string;
  progress: {
    requested: number;
    generated: number;
    batchSize: number;
    batchesDone: number;
    batchesTotal: number;
    attemptsOnCurrentBatch: number;
  };
  error?: { code: string; message: string };
  packId?: string;
}

export interface AcceptSummary {
  created: number;
  skipped: number;
  packId: string;
}

const CLASSIFICATION_LABEL: Record<ImportRowClassification, string> = {
  new: 'جدید / معتبر',
  duplicate_in_file: 'تکراری در خروجی هوش مصنوعی',
  existing: 'موجود / در تعارض — رد شده به‌صورت پیش‌فرض',
  invalid: 'نامعتبر',
};

const CLASSIFICATION_TONE: Record<ImportRowClassification, string> = {
  new: 'is-ok',
  duplicate_in_file: 'is-warn',
  existing: 'is-warn',
  invalid: 'is-error',
};

const PROMPT_PLACEHOLDER =
  'مثال: یک بستهٔ ۵۰۰ کلمه‌ای برای دانشجویانی که قصد تحصیل در آلمان دارند، سطح B1 بساز';

export function AiPackGenerationModal({
  onClose,
  onPlan,
  onLoadModels,
  onApprovePlan,
  onRunBatch,
  onRefresh,
  onAccept,
}: {
  onClose: () => void;
  onPlan: (
    prompt: string,
    model?: string,
  ) => Promise<{ ok: true; job: GenerationJobView } | { ok: false; message: string }>;
  /** Text models this account may use. Resolved once when the modal opens. */
  onLoadModels: () => Promise<{ models: string[]; defaultModel: string } | undefined>;
  onApprovePlan: (
    jobId: string,
    planFingerprint: string,
  ) => Promise<{ ok: true; job: GenerationJobView } | { ok: false; message: string }>;
  onRunBatch: (
    jobId: string,
  ) => Promise<{ ok: true; job: GenerationJobView } | { ok: false; message: string }>;
  onRefresh: (
    jobId: string,
  ) => Promise<
    { ok: true; job: GenerationJobView; analysis: ImportAnalysis } | { ok: false; message: string }
  >;
  onAccept: (
    jobId: string,
    fingerprint: string,
    selectedRows: number[],
  ) => Promise<{ ok: true; summary: AcceptSummary } | { ok: false; message: string }>;
}) {
  const [prompt, setPrompt] = useState('');
  // Model catalog for the selector. Empty until resolved; an unreachable catalog simply leaves the
  // selector hidden and generation proceeds on the server's configured default.
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [stage, setStage] = useState<GenerationStage>('prompt');
  const [job, setJob] = useState<GenerationJobView | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [summary, setSummary] = useState<AcceptSummary | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Generated rows the Admin explicitly ticked. Valid rows start selected, because reviewing a
  // generated pack is an opt-OUT exercise; conflicts and invalid rows are never selectable.
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void onLoadModels().then((catalogue) => {
      if (cancelled || !catalogue) return;
      setModels(catalogue.models);
      setModel(catalogue.defaultModel);
    });
    return () => {
      cancelled = true;
    };
  }, [onLoadModels]);

  const validRows = useMemo(
    () => (analysis ? analysis.rows.filter((row) => row.classification === 'new') : []),
    [analysis],
  );
  const problemRows = useMemo(
    () => (analysis ? analysis.rows.filter((row) => row.classification !== 'new') : []),
    [analysis],
  );
  const selectedCount = validRows.filter((row) => selected.has(row.rowNumber)).length;

  function toggle(rowNumber: number) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  async function handlePlan() {
    setBusy(true);
    setStage('planning');
    setError(undefined);
    const result = await onPlan(prompt, model || undefined);
    setBusy(false);
    if (result.ok) {
      setJob(result.job);
      setStage('plan');
    } else {
      setError(result.message);
      setStage('prompt');
    }
  }

  /**
   * Approves the plan and then drives the batches.
   *
   * The loop is sequential on purpose: one batch in flight at a time, each awaiting the previous,
   * so a 500-card request is 20 bounded calls rather than an uncontrolled fan-out. Progress is
   * repainted from the server's own count after every batch.
   */
  /** Shows the generated cards for review, preselecting the ones that are new. */
  function enterReview(nextJob: GenerationJobView, nextAnalysis: ImportAnalysis) {
    setJob(nextJob);
    setAnalysis(nextAnalysis);
    setSelected(
      new Set(
        nextAnalysis.rows.filter((row) => row.classification === 'new').map((row) => row.rowNumber),
      ),
    );
    setStage('review');
  }

  /** Runs batches until the job stops generating, then moves to review. */
  async function runGeneration(startJob: GenerationJobView) {
    let current = startJob;
    setStage('generating');

    while (current.status === 'generating') {
      const batch = await onRunBatch(current.jobId);
      if (!batch.ok) {
        setBusy(false);
        setError(batch.message);
        // The job keeps its completed batches; a retry resumes at the failed batch.
        const refreshed = await onRefresh(current.jobId);
        if (refreshed.ok) {
          setJob(refreshed.job);
          setAnalysis(refreshed.analysis);
          setStage(refreshed.job.status === 'failed' ? 'failed' : 'generating');
        }
        return;
      }
      current = batch.job;
      setJob(current);
      if (current.status === 'failed') {
        setBusy(false);
        setError(current.error?.message ?? 'تولید با خطا متوقف شد.');
        setStage('failed');
        return;
      }
    }

    const refreshed = await onRefresh(current.jobId);
    setBusy(false);
    if (!refreshed.ok) {
      setError(refreshed.message);
      setStage('failed');
      return;
    }
    enterReview(refreshed.job, refreshed.analysis);
  }

  async function handleApproveAndGenerate() {
    if (!job) return;
    setBusy(true);
    setError(undefined);
    const approved = await onApprovePlan(job.jobId, job.planFingerprint);
    if (!approved.ok) {
      setBusy(false);
      setError(approved.message);
      return;
    }
    setJob(approved.job);
    await runGeneration(approved.job);
  }

  async function handleRetry() {
    if (!job) return;
    setBusy(true);
    setError(undefined);
    const refreshed = await onRefresh(job.jobId);
    if (!refreshed.ok) {
      setBusy(false);
      setError(refreshed.message);
      return;
    }
    setJob(refreshed.job);
    setAnalysis(refreshed.analysis);

    // Resume from where the job actually is. Re-approving an already-approved plan is refused,
    // which would strand cards that were already generated — and paid for — behind a dead button.
    switch (refreshed.job.status) {
      case 'planned':
        setBusy(false);
        await handleApproveAndGenerate();
        return;
      case 'generated':
        setBusy(false);
        enterReview(refreshed.job, refreshed.analysis);
        return;
      case 'accepted':
        setBusy(false);
        setStage('accepted');
        return;
      default:
        await runGeneration(refreshed.job);
    }
  }

  async function handleAccept() {
    if (!job || !analysis || selectedCount === 0) return;
    setBusy(true);
    setError(undefined);
    const result = await onAccept(job.jobId, analysis.importableFingerprint, [...selected]);
    setBusy(false);
    if (result.ok) {
      setSummary(result.summary);
      setStage('accepted');
    } else {
      setError(result.message);
    }
  }

  const footer = (() => {
    if (stage === 'accepted') {
      return (
        <button type="button" className="btn" onClick={onClose}>
          بستن
        </button>
      );
    }
    const primary =
      stage === 'prompt' || stage === 'planning' ? (
        <button
          type="button"
          className="btn primary"
          onClick={handlePlan}
          disabled={busy || prompt.trim().length === 0}
        >
          {busy ? 'در حال ساخت طرح…' : 'ساخت طرح'}
        </button>
      ) : stage === 'plan' ? (
        <button
          type="button"
          className="btn primary"
          onClick={handleApproveAndGenerate}
          disabled={busy}
        >
          {`تأیید طرح و تولید ${job?.plan.cardCount ?? 0} کارت`}
        </button>
      ) : stage === 'generating' ? (
        <button type="button" className="btn primary" onClick={handleRetry} disabled={busy}>
          {busy ? 'در حال تولید…' : 'تلاش دوباره برای این دسته'}
        </button>
      ) : stage === 'failed' ? (
        <button type="button" className="btn primary" onClick={handleRetry} disabled={busy}>
          تلاش دوباره
        </button>
      ) : (
        <button
          type="button"
          className="btn primary"
          onClick={handleAccept}
          disabled={busy || selectedCount === 0}
        >
          {busy ? 'در حال پذیرش…' : `پذیرش ${selectedCount} کارت به‌عنوان Draft`}
        </button>
      );
    return (
      <>
        {primary}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          انصراف
        </button>
      </>
    );
  })();

  return (
    <CpModal title="ساخت بسته با هوش مصنوعی" onClose={onClose} footer={footer} wide>
      {error ? (
        <p className="cp-form-status is-error" role="alert">
          {error}
        </p>
      ) : null}

      {stage === 'prompt' || stage === 'planning' ? (
        <div className="cp-form-row">
          <label htmlFor="ai-prompt">بستهٔ مورد نظر را توصیف کنید</label>
          <textarea
            id="ai-prompt"
            className="cp-input"
            rows={4}
            value={prompt}
            maxLength={2000}
            placeholder={PROMPT_PLACEHOLDER}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={busy}
          />
          {models.length > 1 ? (
            <div className="cp-form-field">
              <label htmlFor="ai-model">مدل متنی</label>
              <select
                id="ai-model"
                className="cp-input"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={busy}
              >
                {models.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <p className="cp-note">
                مدل انتخاب‌شده برای طرح و همهٔ دسته‌های همین بسته استفاده می‌شود.
              </p>
            </div>
          ) : null}
          <p className="cp-note">
            ابتدا یک طرح ساخته می‌شود و پیش از تولید کارت‌ها آن را بررسی می‌کنید. محتوای ساخته‌شده
            همیشه به‌صورت Draft وارد می‌شود و تا تأیید در چرخهٔ بازبینی برای زبان‌آموز نمایش داده
            نمی‌شود.
          </p>
        </div>
      ) : null}

      {stage === 'plan' && job ? <PlanPreview job={job} /> : null}

      {(stage === 'generating' || stage === 'failed') && job ? <Progress job={job} /> : null}

      {stage === 'review' && analysis && job ? (
        <GeneratedPreview
          analysis={analysis}
          job={job}
          validRows={validRows}
          problemRows={problemRows}
          selected={selected}
          onToggle={toggle}
          selectedCount={selectedCount}
        />
      ) : null}

      {stage === 'accepted' && summary ? (
        <div className="cp-import-preview">
          <p className="cp-form-status is-success" role="status">
            {summary.created} کارت به‌عنوان نسخهٔ Draft در بستهٔ «{summary.packId}» ساخته شد.
          </p>
          <p className="cp-note">
            این کارت‌ها در وضعیت Draft هستند و برای زبان‌آموزان نمایش داده نمی‌شوند. انتشار آن‌ها
            فقط از طریق چرخهٔ بازبینی و تأیید انجام می‌شود.
          </p>
          {summary.skipped > 0 ? (
            <p className="cp-note">{summary.skipped} سطر پذیرفته نشد.</p>
          ) : null}
        </div>
      ) : null}
    </CpModal>
  );
}

/** The plan gate: everything the Admin approves BEFORE any card is generated. */
function PlanPreview({ job }: { job: GenerationJobView }) {
  const plan = job.plan;
  return (
    <div className="cp-import-preview">
      <div className="cp-import-meta">
        <span>شناسهٔ بسته: {plan.packId}</span>
        <span>سطح: {plan.cefr}</span>
        {job.model ? <span>مدل: {job.model}</span> : null}
      </div>

      <dl className="cp-plan-grid">
        <dt>عنوان</dt>
        <dd>{plan.title}</dd>
        <dt>توضیح</dt>
        <dd>{plan.description || '—'}</dd>
        <dt>مخاطب</dt>
        <dd>{plan.audience || '—'}</dd>
        <dt>تعداد کارت</dt>
        <dd>
          {plan.cardCount}
          {plan.requestedCount !== plan.cardCount ? (
            <span className="cp-note">
              {' '}
              (درخواست: {plan.requestedCount} — به سقف مجاز سرور محدود شد)
            </span>
          ) : null}
        </dd>
        <dt>راهبرد موضوعی</dt>
        <dd>{plan.strategy || '—'}</dd>
        <dt>موضوع‌ها</dt>
        <dd>{plan.topics.length > 0 ? plan.topics.join('، ') : '—'}</dd>
        <dt>دامنه</dt>
        <dd>{plan.scope || '—'}</dd>
        <dt>فیلدهای تولیدی</dt>
        <dd>{plan.fields.join('، ')}</dd>
      </dl>

      <ul className="cp-import-statement">
        <li>
          کارت‌هایی که تولید می‌شوند: <strong>{plan.cardCount}</strong>
        </li>
        <li>
          اندازهٔ هر دسته: <strong>{job.progress.batchSize}</strong>
        </li>
        <li>
          تعداد دسته‌ها: <strong>{job.progress.batchesTotal}</strong>
        </li>
      </ul>
      <p className="cp-note">
        تا زمانی که این طرح را تأیید نکنید هیچ کارتی تولید نمی‌شود، و تولید هم به‌تنهایی چیزی در
        محتوای اصلی نمی‌نویسد.
      </p>
    </div>
  );
}

/** Real progress: counts the server has confirmed, never an animation. */
function Progress({ job }: { job: GenerationJobView }) {
  const { generated, requested, batchesDone, batchesTotal, attemptsOnCurrentBatch } = job.progress;
  return (
    <div className="cp-import-preview">
      <div className="cp-import-meta">
        <span>
          دستهٔ {Math.min(batchesDone + 1, batchesTotal)} از {batchesTotal}
        </span>
        <span>
          کارت تولیدشده: {generated} از {requested}
        </span>
      </div>
      <progress
        className="cp-progress"
        value={generated}
        max={requested}
        aria-label={`کارت تولیدشده: ${generated} از ${requested}`}
      />
      {attemptsOnCurrentBatch > 0 ? (
        <p className="cp-note">تلاش‌های ناموفق روی دستهٔ جاری: {attemptsOnCurrentBatch}</p>
      ) : null}
      {job.error ? (
        <p className="cp-form-status is-error" role="alert">
          {job.error.message}
        </p>
      ) : null}
      {job.status === 'failed' ? (
        <p className="cp-note">
          کارت‌های تولیدشدهٔ پیش از خطا حفظ شده‌اند؛ تلاش دوباره از همان دسته ادامه می‌دهد.
        </p>
      ) : null}
    </div>
  );
}

function GeneratedPreview({
  analysis,
  job,
  validRows,
  problemRows,
  selected,
  onToggle,
  selectedCount,
}: {
  analysis: ImportAnalysis;
  job: GenerationJobView;
  validRows: ImportAnalysisRow[];
  problemRows: ImportAnalysisRow[];
  selected: ReadonlySet<number>;
  onToggle: (rowNumber: number) => void;
  selectedCount: number;
}) {
  return (
    <div className="cp-import-preview">
      <div className="cp-import-meta">
        <span>بستهٔ هدف: {job.plan.packId}</span>
        <span>کل کارت‌های تولیدشده: {analysis.totalRows}</span>
      </div>

      <div className="cp-import-counts">
        {(['new', 'duplicate_in_file', 'existing', 'invalid'] as ImportRowClassification[]).map(
          (key) => (
            <div key={key} className={`cp-import-count ${CLASSIFICATION_TONE[key]}`}>
              <strong>{analysis.counts[key]}</strong>
              <span>{CLASSIFICATION_LABEL[key]}</span>
            </div>
          ),
        )}
      </div>

      <ul className="cp-import-statement">
        <li>
          کارت‌هایی که به‌عنوان Draft پذیرفته می‌شوند: <strong>{selectedCount}</strong>
        </li>
        <li>
          کارت‌های معتبر انتخاب‌نشده: <strong>{validRows.length - selectedCount}</strong>
        </li>
        <li>
          تکراری یا در تعارض با محتوای موجود: <strong>{problemRows.length}</strong>
        </li>
      </ul>
      <p className="cp-note">
        کارت‌های در تعارض با محتوای موجود پذیرفته نمی‌شوند و هیچ کارت منتشرشده‌ای تغییر نمی‌کند.
        به‌روزرسانی محتوای موجود فقط از مسیر درون‌ریزی و با انتخاب صریح انجام می‌شود.
      </p>

      {validRows.length > 0 ? (
        <div className="cp-import-issues">
          <h4>کارت‌های معتبر</h4>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">پذیرش</th>
                <th scope="col">واژه</th>
                <th scope="col">شناسهٔ محتوا</th>
                <th scope="col">سطح</th>
              </tr>
            </thead>
            <tbody>
              {validRows.map((row) => (
                <tr key={row.rowNumber}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(row.rowNumber)}
                      onChange={() => onToggle(row.rowNumber)}
                      aria-label={`پذیرش «${row.lemma || row.rowNumber}»`}
                    />
                  </td>
                  <td>{row.lemma || '—'}</td>
                  <td>{row.contentId || '—'}</td>
                  <td>{job.plan.cefr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {problemRows.length > 0 ? (
        <div className="cp-import-issues">
          <h4>کارت‌هایی که پذیرفته نمی‌شوند</h4>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">واژه</th>
                <th scope="col">وضعیت</th>
                <th scope="col">دلیل</th>
              </tr>
            </thead>
            <tbody>
              {problemRows.map((row) => (
                <tr key={row.rowNumber}>
                  <td>{row.lemma || '—'}</td>
                  <td>
                    <span className={`cp-import-badge ${CLASSIFICATION_TONE[row.classification]}`}>
                      {CLASSIFICATION_LABEL[row.classification]}
                    </span>
                  </td>
                  <td>
                    {row.issues.length > 0
                      ? row.issues.map((issue) => issue.message).join(' ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
