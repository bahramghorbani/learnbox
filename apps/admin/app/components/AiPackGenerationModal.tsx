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
  isFree: boolean;
}

export interface GenerationJobView {
  jobId: string;
  status: 'planned' | 'generating' | 'generated' | 'accepted' | 'failed';
  prompt: string;
  plan: GenerationPlanView;
  planFingerprint: string;
  provider?: string;
  model?: string;
  reviewerModel?: string;
  repairModel?: string;
  quality?: QualityReport;
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

export interface ReviewFindingView {
  field: string;
  severity: string;
  reason: string;
  suggestion: string;
  source: string;
}
export interface ReviewRowView {
  state: string;
  findings: ReviewFindingView[];
  repairRounds: number;
  repaired: boolean;
  /** Each review pass in order; earlier passes hold the findings a repair already fixed. */
  history?: Array<{ round: number; findings: ReviewFindingView[] }>;
}

/** The fields of a plan the Admin may change before generation. */
export interface PlanDraft {
  packId: string;
  title: string;
  description: string;
  audience: string;
  cefr: string;
  cardCount: number;
  topics: string[];
  strategy: string;
  scope: string;
  isFree: boolean;
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

function draftOf(plan: GenerationPlanView): PlanDraft {
  return {
    packId: plan.packId,
    title: plan.title,
    description: plan.description,
    audience: plan.audience,
    cefr: plan.cefr,
    cardCount: plan.cardCount,
    topics: [...plan.topics],
    strategy: plan.strategy,
    scope: plan.scope,
    isFree: plan.isFree,
  };
}

/** Only the fields that differ from the server plan are sent, so an untouched plan is not revised. */
export function planEditsOf(plan: GenerationPlanView, draft: PlanDraft): Partial<PlanDraft> {
  const original = draftOf(plan);
  const edits: Partial<PlanDraft> = {};
  (Object.keys(original) as Array<keyof PlanDraft>).forEach((key) => {
    if (JSON.stringify(original[key]) !== JSON.stringify(draft[key])) {
      (edits as Record<string, unknown>)[key] = draft[key];
    }
  });
  return edits;
}
export interface QualityReport {
  target: number;
  totalGenerated: number;
  ready: number;
  passedFirstReview: number;
  repaired: number;
  withIssues: number;
  invalid: number;
  duplicates: number;
  minorWarnings: number;
  unreviewed: number;
  shortfall: number;
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
  onRevisePlan,
  onRunBatch,
  onRefresh,
  onAccept,
}: {
  onClose: () => void;
  onPlan: (
    prompt: string,
    model?: string,
    isFree?: boolean,
  ) => Promise<{ ok: true; job: GenerationJobView } | { ok: false; message: string }>;
  /** Text models this account may use. Resolved once when the modal opens. */
  onLoadModels: () => Promise<{ models: string[]; defaultModel: string } | undefined>;
  onApprovePlan: (
    jobId: string,
    planFingerprint: string,
  ) => Promise<{ ok: true; job: GenerationJobView } | { ok: false; message: string }>;
  /** Saves the Admin's direct plan edits; the server re-validates and returns a new fingerprint. */
  onRevisePlan: (
    jobId: string,
    planFingerprint: string,
    edits: Partial<PlanDraft>,
  ) => Promise<{ ok: true; job: GenerationJobView } | { ok: false; message: string }>;
  onRunBatch: (
    jobId: string,
  ) => Promise<{ ok: true; job: GenerationJobView } | { ok: false; message: string }>;
  onRefresh: (jobId: string) => Promise<
    | {
        ok: true;
        job: GenerationJobView;
        analysis: ImportAnalysis;
        quality?: QualityReport;
        reviews?: Record<number, ReviewRowView>;
      }
    | { ok: false; message: string }
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
  const [isFree, setIsFree] = useState(false);
  const [stage, setStage] = useState<GenerationStage>('prompt');
  const [job, setJob] = useState<GenerationJobView | null>(null);
  // The Admin's working copy of the plan. Approval always saves it first, so what is generated is
  // exactly what the Admin last saw on screen.
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [reviews, setReviews] = useState<Record<number, ReviewRowView>>({});
  const [summary, setSummary] = useState<AcceptSummary | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
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
    () =>
      analysis
        ? analysis.rows.filter(
            (row) =>
              row.classification === 'new' &&
              (!reviews[row.rowNumber] || reviews[row.rowNumber]?.state === 'passed'),
          )
        : [],
    [analysis, reviews],
  );
  const problemRows = useMemo(
    () =>
      analysis
        ? analysis.rows.filter(
            (row) =>
              row.classification !== 'new' ||
              (reviews[row.rowNumber] !== undefined && reviews[row.rowNumber]?.state !== 'passed'),
          )
        : [],
    [analysis, reviews],
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
    const result = await onPlan(prompt, model || undefined, isFree);
    setBusy(false);
    if (result.ok) {
      setJob(result.job);
      setDraft(draftOf(result.job.plan));
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
  function enterReview(
    nextJob: GenerationJobView,
    nextAnalysis: ImportAnalysis,
    nextQuality?: QualityReport,
    nextReviews: Record<number, ReviewRowView> = {},
  ) {
    setJob(nextJob);
    setAnalysis(nextAnalysis);
    setQuality(nextQuality ?? nextJob.quality ?? null);
    setReviews(nextReviews);
    setSelected(
      new Set(
        nextAnalysis.rows
          .filter(
            (row) =>
              row.classification === 'new' &&
              (!nextReviews[row.rowNumber] || nextReviews[row.rowNumber]?.state === 'passed'),
          )
          .map((row) => row.rowNumber),
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
    enterReview(refreshed.job, refreshed.analysis, refreshed.quality, refreshed.reviews);
  }

  const pendingEdits = job && draft ? planEditsOf(job.plan, draft) : {};
  const hasPendingEdits = Object.keys(pendingEdits).length > 0;

  /** Saves pending plan edits. Returns the job to approve, or undefined when the save failed. */
  async function savePlanEdits(): Promise<GenerationJobView | undefined> {
    if (!job || !draft) return undefined;
    if (!hasPendingEdits) return job;
    const revised = await onRevisePlan(job.jobId, job.planFingerprint, pendingEdits);
    if (!revised.ok) {
      setError(revised.message);
      return undefined;
    }
    setJob(revised.job);
    setDraft(draftOf(revised.job.plan));
    return revised.job;
  }

  async function handleSavePlan() {
    setBusy(true);
    setError(undefined);
    setPlanSaved(false);
    if (await savePlanEdits()) setPlanSaved(true);
    setBusy(false);
  }

  async function handleApproveAndGenerate() {
    if (!job) return;
    setBusy(true);
    setError(undefined);
    const toApprove = await savePlanEdits();
    if (!toApprove) {
      setBusy(false);
      return;
    }
    const approved = await onApprovePlan(toApprove.jobId, toApprove.planFingerprint);
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
        enterReview(refreshed.job, refreshed.analysis, refreshed.quality, refreshed.reviews);
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
        <>
          <button
            type="button"
            className="btn primary"
            onClick={handleApproveAndGenerate}
            disabled={busy || !draft || !planDraftUsable(draft, job!.plan)}
          >
            {busy
              ? 'در حال ثبت طرح…'
              : `${hasPendingEdits ? 'ذخیره، تأیید طرح' : 'تأیید طرح'} و تولید ${draft?.cardCount ?? job?.plan.cardCount ?? 0} کارت`}
          </button>
          {hasPendingEdits ? (
            <button
              type="button"
              className="btn"
              onClick={handleSavePlan}
              disabled={busy || !draft || !planDraftUsable(draft, job!.plan)}
            >
              ذخیرهٔ تغییرات طرح
            </button>
          ) : null}
        </>
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
          <div className="cp-form-field">
            <label htmlFor="ai-pack-commercial-state">وضعیت دسترسی بسته</label>
            <select
              id="ai-pack-commercial-state"
              className="cp-input"
              value={isFree ? 'free' : 'paid'}
              onChange={(event) => setIsFree(event.target.value === 'free')}
              disabled={busy}
            >
              <option value="paid">پولی</option>
              <option value="free">رایگان</option>
            </select>
            <p className="cp-note">
              این انتخاب توسط مدیر انجام می‌شود و هوش مصنوعی آن را تغییر نمی‌دهد.
            </p>
          </div>
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

      {stage === 'plan' && job && draft ? (
        <PlanEditor
          job={job}
          draft={draft}
          onChange={(next) => {
            setPlanSaved(false);
            setDraft(next);
          }}
          disabled={busy}
          dirty={hasPendingEdits}
        />
      ) : null}
      {stage === 'plan' && planSaved && !hasPendingEdits ? (
        <p className="cp-form-status is-success" role="status">
          تغییرات طرح ذخیره شد. هنوز چیزی تولید نشده است؛ برای شروع «تأیید طرح و تولید» را بزنید.
        </p>
      ) : null}

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
          quality={quality}
          reviews={reviews}
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

/**
 * Mirrors the server's edit rules so the form can guide the Admin; the server stays authoritative.
 * Topics are only required once the Admin edits them, exactly like the server.
 */
export function planDraftUsable(draft: PlanDraft, plan: GenerationPlanView): boolean {
  const topicsEdited = JSON.stringify(draft.topics) !== JSON.stringify(plan.topics);
  return (
    draft.title.trim().length > 0 &&
    /^[a-z0-9][a-z0-9-]{0,59}$/.test(draft.packId.trim()) &&
    Number.isSafeInteger(draft.cardCount) &&
    draft.cardCount >= 1 &&
    (!topicsEdited || draft.topics.some((topic) => topic.trim().length > 0))
  );
}

/**
 * The plan gate: everything the Admin approves BEFORE any card is generated, editable in place.
 * Client checks only guide the form; the server re-validates every field (and caps the count) when
 * the edits are saved, and approval binds to the fingerprint of the saved plan.
 */
function PlanEditor({
  job,
  draft,
  onChange,
  disabled,
  dirty,
}: {
  job: GenerationJobView;
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  disabled: boolean;
  dirty: boolean;
}) {
  const plan = job.plan;
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const topicsText = draft.topics.join('\n');
  const batchSize = Math.max(1, job.progress.batchSize);
  const batches = Math.ceil(Math.max(1, draft.cardCount) / batchSize);
  return (
    <div className="cp-import-preview" data-plan-editor>
      <div className="cp-import-meta">
        {job.model ? (
          <span>
            مدل تولید: <bdi dir="ltr">{job.model}</bdi>
          </span>
        ) : null}
        {job.reviewerModel ? (
          <span>
            بازبین مستقل: <bdi dir="ltr">{job.reviewerModel}</bdi>
          </span>
        ) : null}
        {dirty ? <span className="cp-import-badge is-warn">تغییرات ذخیره‌نشده</span> : null}
      </div>

      <div className="cp-form-grid">
        <div className="cp-form-row is-full">
          <label htmlFor="ai-plan-title">عنوان بسته</label>
          <input
            id="ai-plan-title"
            className="cp-input"
            value={draft.title}
            maxLength={120}
            disabled={disabled}
            onChange={(event) => set('title', event.target.value)}
          />
        </div>
        <div className="cp-form-row">
          <label htmlFor="ai-plan-pack-id">شناسهٔ بسته</label>
          <input
            id="ai-plan-pack-id"
            className="cp-input keep-latin"
            dir="ltr"
            value={draft.packId}
            maxLength={60}
            disabled={disabled}
            aria-describedby="ai-plan-pack-id-hint"
            onChange={(event) => set('packId', event.target.value.toLowerCase())}
          />
          <p className="cp-note" id="ai-plan-pack-id-hint">
            حروف کوچک لاتین، عدد و خط تیره؛ پس از ساخت بسته قابل تغییر نیست.
          </p>
        </div>
        <div className="cp-form-row">
          <label htmlFor="ai-plan-cefr">سطح</label>
          <select
            id="ai-plan-cefr"
            className="cp-input"
            value={draft.cefr}
            disabled={disabled}
            onChange={(event) => set('cefr', event.target.value)}
          >
            {CEFR_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className="cp-form-row">
          <label htmlFor="ai-plan-count">تعداد کارت</label>
          <input
            id="ai-plan-count"
            className="cp-input"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={Number.isFinite(draft.cardCount) ? draft.cardCount : ''}
            disabled={disabled}
            aria-describedby="ai-plan-count-hint"
            onChange={(event) => set('cardCount', Number.parseInt(event.target.value, 10))}
          />
          <p className="cp-note" id="ai-plan-count-hint">
            {batches} دسته، هر دسته حداکثر {batchSize} کارت. سقف مجاز را سرور هنگام ذخیره بررسی
            می‌کند.
          </p>
        </div>
        <div className="cp-form-row">
          <label htmlFor="ai-plan-access">نوع دسترسی</label>
          <select
            id="ai-plan-access"
            className="cp-input"
            value={draft.isFree ? 'free' : 'paid'}
            disabled={disabled}
            onChange={(event) => set('isFree', event.target.value === 'free')}
          >
            <option value="paid">پولی</option>
            <option value="free">رایگان</option>
          </select>
        </div>
        <div className="cp-form-row is-full">
          <label htmlFor="ai-plan-topics">موضوع‌ها (هر خط یک موضوع)</label>
          <textarea
            id="ai-plan-topics"
            className="cp-textarea"
            rows={4}
            value={topicsText}
            disabled={disabled}
            onChange={(event) => set('topics', event.target.value.split('\n'))}
          />
        </div>
        <div className="cp-form-row is-full">
          <label htmlFor="ai-plan-audience">مخاطب</label>
          <input
            id="ai-plan-audience"
            className="cp-input"
            value={draft.audience}
            maxLength={300}
            disabled={disabled}
            onChange={(event) => set('audience', event.target.value)}
          />
        </div>
        <div className="cp-form-row is-full">
          <label htmlFor="ai-plan-description">توضیح</label>
          <textarea
            id="ai-plan-description"
            className="cp-textarea"
            rows={2}
            value={draft.description}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>
        <div className="cp-form-row is-full">
          <label htmlFor="ai-plan-strategy">راهبرد موضوعی</label>
          <textarea
            id="ai-plan-strategy"
            className="cp-textarea"
            rows={2}
            value={draft.strategy}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) => set('strategy', event.target.value)}
          />
        </div>
        <div className="cp-form-row is-full">
          <label htmlFor="ai-plan-scope">دامنه و مشخصات ضروری</label>
          <textarea
            id="ai-plan-scope"
            className="cp-textarea"
            rows={2}
            value={draft.scope}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) => set('scope', event.target.value)}
          />
        </div>
      </div>

      <dl className="cp-plan-grid">
        <dt>فیلدهای تولیدی</dt>
        <dd>{plan.fields.join('، ')}</dd>
      </dl>

      {!planDraftUsable(draft, plan) ? (
        <p className="cp-form-status is-error" role="alert">
          عنوان، شناسهٔ معتبر، تعداد کارت مثبت و دست‌کم یک موضوع لازم است.
        </p>
      ) : null}
      <p className="cp-note">
        تا زمانی که این طرح را تأیید نکنید هیچ کارتی تولید نمی‌شود، و تولید هم به‌تنهایی چیزی در
        محتوای اصلی نمی‌نویسد. ویرایش طرح هیچ فراخوانی هوش مصنوعی انجام نمی‌دهد.
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

/** Review verdict plus what the repair fixed and which advisory findings remain. */
export function ReviewCell({ review }: { review?: ReviewRowView }) {
  if (!review) return <>—</>;
  const fixed = review.repaired
    ? (review.history ?? []).slice(0, -1).flatMap((pass) => pass.findings)
    : [];
  const items = [
    ...fixed.map((finding) => ({ finding, label: 'رفع‌شده' })),
    ...review.findings.map((finding) => ({ finding, label: 'باقی‌مانده (توصیه)' })),
  ];
  return (
    <>
      {review.repaired ? (
        <span className="cp-import-badge is-warn">اصلاح خودکار و تأیید بازبین</span>
      ) : (
        <span className="cp-import-badge is-ok">تأیید در بار اول</span>
      )}
      {items.length > 0 ? (
        <details className="ai-review-details">
          <summary>جزئیات ({items.length})</summary>
          <ul className="ai-finding-list">
            {items.map(({ finding, label }, index) => (
              <li key={index} className="ai-finding-item">
                <span className="ai-finding-meta">
                  {label} · <span className="keep-latin">{finding.field}</span>
                </span>
                <span>{finding.reason}</span>
                {finding.suggestion ? <span>پیشنهاد: {finding.suggestion}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
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
  quality,
  reviews,
}: {
  analysis: ImportAnalysis;
  job: GenerationJobView;
  validRows: ImportAnalysisRow[];
  problemRows: ImportAnalysisRow[];
  selected: ReadonlySet<number>;
  onToggle: (rowNumber: number) => void;
  selectedCount: number;
  quality: QualityReport | null;
  reviews: Record<number, ReviewRowView>;
}) {
  return (
    <div className="cp-import-preview">
      <div className="cp-import-meta">
        <span>بستهٔ هدف: {job.plan.packId}</span>
        <span>کل کارت‌های تولیدشده: {analysis.totalRows}</span>
      </div>

      {quality ? (
        <section className="cp-import-issues" aria-label="گزارش بازبینی مستقل">
          <h4>گزارش بازبینی مستقل</h4>
          <ul className="cp-import-statement">
            <li>
              هدف طرح: <strong>{quality.target}</strong>؛ آماده برای پذیرش:{' '}
              <strong>{quality.ready}</strong>
            </li>
            <li>
              پذیرفته در بار اول: <strong>{quality.passedFirstReview}</strong>؛ اصلاح و پذیرفته:{' '}
              <strong>{quality.repaired}</strong>
            </li>
            <li>
              خطای حل‌نشده: <strong>{quality.withIssues}</strong>؛ هشدار جزئی:{' '}
              <strong>{quality.minorWarnings}</strong>
            </li>
            <li>
              کسری نسبت به هدف: <strong>{quality.shortfall}</strong> — تعداد هدف خودکار کاهش
              نمی‌یابد.
            </li>
          </ul>
          <p className="cp-note">
            بازبین مستقل است و هیچ تأیید یا انتشار خودکاری انجام نمی‌دهد؛ فقط کارت‌های بدون خطای
            حل‌نشده در انتخاب پیش‌فرض قرار می‌گیرند.
          </p>
        </section>
      ) : null}

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
                <th scope="col">بازبینی</th>
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
                  <td>
                    <ReviewCell review={reviews[row.rowNumber]} />
                  </td>
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
                    {reviews[row.rowNumber]?.findings.length ? (
                      <>
                        {reviews[row.rowNumber]!.findings.map((finding, index) => (
                          <span key={index} className="cp-finding">
                            {finding.source === 'validator' ? 'اعتبارسنج: ' : 'بازبین: '}
                            {finding.reason}
                            {finding.suggestion ? ` — پیشنهاد: ${finding.suggestion}` : ''}
                          </span>
                        ))}
                        {reviews[row.rowNumber]!.repairRounds > 0 ? (
                          <span className="cp-note">
                            پس از {reviews[row.rowNumber]!.repairRounds} دور اصلاح خودکار حل نشد.
                          </span>
                        ) : null}
                      </>
                    ) : Array.isArray(row.issues) && row.issues.length > 0 ? (
                      row.issues.map((issue) => issue.message).join(' ')
                    ) : (
                      'خطای بازبین حل‌نشده یا کارت بررسی‌نشده'
                    )}
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
