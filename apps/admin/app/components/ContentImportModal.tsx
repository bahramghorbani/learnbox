'use client';

import { useMemo, useState } from 'react';

import { CpModal } from './ContentPackForms';

/**
 * Phase 1 / Milestone 1.3 — standard CSV/XLSX import wizard.
 *
 * Reuses the frozen prototype's modal/form/table primitives (`.cp-*`, re-scoped from
 * `.scrim`/`.modal`/`.input`/`.table`) — no new visual language is introduced. The prototype
 * already names this feature «درون‌ریزی CSV / XLSX» on the pack-creation form, and that wording is
 * kept verbatim.
 *
 * The wizard is deliberately explicit about consequence: the confirm button states how many rows
 * will be written, and rows that will NOT be written are listed with their source row numbers so
 * the file can be corrected. Nothing is written until the owner confirms.
 */

export type ImportRowClassification = 'new' | 'duplicate_in_file' | 'existing' | 'invalid';

export interface ImportAnalysisRow {
  rowNumber: number;
  lemma: string;
  contentId?: string;
  classification: ImportRowClassification;
  issues: Array<{ field: string; message: string }>;
  duplicateOfRow?: number;
}

export interface ImportAnalysis {
  packId: string;
  filename: string;
  fileKind: 'csv' | 'xlsx';
  totalRows: number;
  counts: Record<ImportRowClassification, number>;
  rows: ImportAnalysisRow[];
  unknownHeaders: string[];
  missingRequiredColumns: string[];
  importableFingerprint: string;
  importableCount: number;
}

export interface ImportOutcome {
  rowNumber: number;
  contentId: string;
  status: 'created' | 'skipped';
  reason?: string;
}

export interface ImportResultSummary {
  status: 'applied' | 'idempotent';
  created: number;
  skipped: number;
  outcomes: ImportOutcome[];
}

const CLASSIFICATION_LABEL: Record<ImportRowClassification, string> = {
  new: 'جدید',
  duplicate_in_file: 'تکراری در فایل',
  existing: 'از قبل موجود',
  invalid: 'نامعتبر',
};

const CLASSIFICATION_TONE: Record<ImportRowClassification, string> = {
  new: 'is-ok',
  duplicate_in_file: 'is-warn',
  existing: 'is-warn',
  invalid: 'is-bad',
};

export function ContentImportModal({
  packLabel,
  templateHref,
  onClose,
  onPreview,
  onConfirm,
}: {
  packLabel: string;
  templateHref: string;
  onClose: () => void;
  onPreview: (
    file: File,
  ) => Promise<{ ok: true; analysis: ImportAnalysis } | { ok: false; message: string }>;
  onConfirm: (
    file: File,
    fingerprint: string,
  ) => Promise<{ ok: true; summary: ImportResultSummary } | { ok: false; message: string }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [summary, setSummary] = useState<ImportResultSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const notImported = useMemo(
    () => (analysis ? analysis.rows.filter((row) => row.classification !== 'new') : []),
    [analysis],
  );

  async function handlePreview() {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setSummary(null);
    const result = await onPreview(file);
    setBusy(false);
    if (result.ok) setAnalysis(result.analysis);
    else {
      setAnalysis(null);
      setError(result.message);
    }
  }

  async function handleConfirm() {
    if (!file || !analysis || analysis.importableCount === 0) return;
    setBusy(true);
    setError(undefined);
    const result = await onConfirm(file, analysis.importableFingerprint);
    setBusy(false);
    if (result.ok) setSummary(result.summary);
    else setError(result.message);
  }

  const footer = summary ? (
    <button type="button" className="btn" onClick={onClose}>
      بستن
    </button>
  ) : (
    <>
      <button
        type="button"
        className="btn primary"
        onClick={analysis ? handleConfirm : handlePreview}
        disabled={busy || !file || (analysis !== null && analysis.importableCount === 0)}
      >
        {busy
          ? 'در حال پردازش…'
          : analysis
            ? // The action states exactly what will be written — never a vague "Import".
              `درون‌ریزی ${analysis.importableCount} کارت جدید`
            : 'بررسی فایل'}
      </button>
      <button type="button" className="btn" onClick={onClose} disabled={busy}>
        انصراف
      </button>
    </>
  );

  return (
    <CpModal title="درون‌ریزی CSV / XLSX" onClose={onClose} footer={footer} wide>
      {error ? (
        <p className="cp-form-status is-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="cp-import-target">
        <span className="cp-import-chip">بستهٔ هدف: {packLabel}</span>
        <a className="cp-import-link" href={templateHref} download>
          دریافت قالب نمونه
        </a>
      </div>

      {summary ? (
        <ImportResult summary={summary} />
      ) : (
        <>
          <div className="cp-form-row">
            <label htmlFor="cp-import-file">فایل CSV یا XLSX</label>
            <input
              id="cp-import-file"
              className="cp-select"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setAnalysis(null);
                setSummary(null);
                setError(undefined);
              }}
            />
            <p className="cp-note">
              ستون‌های الزامی را از قالب نمونه بردارید. تا زمانی که «درون‌ریزی» را تأیید نکنید هیچ
              چیزی ذخیره نمی‌شود.
            </p>
          </div>

          {analysis ? <ImportPreview analysis={analysis} notImported={notImported} /> : null}
        </>
      )}
    </CpModal>
  );
}

function ImportPreview({
  analysis,
  notImported,
}: {
  analysis: ImportAnalysis;
  notImported: ImportAnalysisRow[];
}) {
  return (
    <div className="cp-import-preview">
      <div className="cp-import-meta">
        <span>
          فایل: {analysis.filename} ({analysis.fileKind.toUpperCase()})
        </span>
        <span>کل سطرها: {analysis.totalRows}</span>
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

      {analysis.missingRequiredColumns.length > 0 ? (
        <p className="cp-form-status is-error" role="alert">
          ستون‌های الزامی در فایل نیست: {analysis.missingRequiredColumns.join('، ')}
        </p>
      ) : null}

      {analysis.unknownHeaders.length > 0 ? (
        <p className="cp-note">
          ستون‌های ناشناخته نادیده گرفته می‌شوند: {analysis.unknownHeaders.join('، ')}
        </p>
      ) : null}

      <p className="cp-import-statement">
        {analysis.importableCount > 0
          ? `${analysis.importableCount} کارت جدید به‌صورت «پیش‌نویس» ساخته می‌شود. ${notImported.length} سطر نوشته نمی‌شود.`
          : 'هیچ سطر قابل درون‌ریزی وجود ندارد. فایل را اصلاح کنید و دوباره بررسی بگیرید.'}
      </p>

      {notImported.length > 0 ? (
        <div className="cp-import-issues">
          <h4>سطرهایی که نوشته نمی‌شوند</h4>
          <table className="table">
            <thead>
              <tr>
                <th>سطر</th>
                <th>واژه</th>
                <th>وضعیت</th>
                <th>دلیل</th>
              </tr>
            </thead>
            <tbody>
              {notImported.map((row) => (
                <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
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

function ImportResult({ summary }: { summary: ImportResultSummary }) {
  return (
    <div className="cp-import-preview">
      <p className="cp-form-status is-success" role="status">
        {summary.status === 'idempotent'
          ? 'این درون‌ریزی قبلاً انجام شده بود؛ چیزی دوباره ساخته نشد.'
          : `${summary.created} کارت جدید به‌صورت «پیش‌نویس» ساخته شد.`}
      </p>
      <p className="cp-note">
        کارت‌های ساخته‌شده پیش‌نویس هستند و تا تأیید بررسی محتوا برای زبان‌آموز نمایش داده نمی‌شوند.{' '}
        {summary.skipped} سطر نوشته نشد.
      </p>
    </div>
  );
}
