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
  /** Present on `existing` rows: the card that would receive a new draft version if selected. */
  existingCardId?: string;
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
  status: 'created' | 'versioned' | 'skipped';
  reason?: string;
}

export interface ImportResultSummary {
  status: 'applied' | 'idempotent';
  created: number;
  versioned: number;
  skipped: number;
  outcomes: ImportOutcome[];
}

const CLASSIFICATION_LABEL: Record<ImportRowClassification, string> = {
  new: 'جدید',
  duplicate_in_file: 'تکراری داخل فایل',
  existing: 'موجود / در تعارض — رد شده به‌صورت پیش‌فرض',
  invalid: 'نامعتبر',
};

/** A conflicting row the Admin explicitly selected reads differently from a skipped one. */
const SELECTED_CONFLICT_LABEL = 'موجود / در تعارض — انتخاب‌شده برای نسخه Draft جدید';

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
    selectedConflictRows: number[],
  ) => Promise<{ ok: true; summary: ImportResultSummary } | { ok: false; message: string }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [summary, setSummary] = useState<ImportResultSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Conflicting rows the Admin explicitly ticked. Empty by default: conflicts are skipped
  // unless the owner opts each one in.
  const [selectedConflicts, setSelectedConflicts] = useState<ReadonlySet<number>>(new Set());

  const notImported = useMemo(
    () => (analysis ? analysis.rows.filter((row) => row.classification !== 'new') : []),
    [analysis],
  );

  /** Conflicts that CAN be overridden — the server must have supplied a target card. */
  const selectableConflicts = useMemo(
    () =>
      analysis
        ? analysis.rows.filter((row) => row.classification === 'existing' && row.existingCardId)
        : [],
    [analysis],
  );

  const selectedCount = selectableConflicts.filter((row) =>
    selectedConflicts.has(row.rowNumber),
  ).length;
  const skippedCount = notImported.length - selectedCount;
  const invalidCount = analysis?.counts.invalid ?? 0;
  const totalToWrite = (analysis?.importableCount ?? 0) + selectedCount;

  function toggleConflict(rowNumber: number) {
    setSelectedConflicts((previous) => {
      const next = new Set(previous);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  async function handlePreview() {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setSummary(null);
    const result = await onPreview(file);
    setBusy(false);
    // A fresh preview always clears the previous selection: selections only ever apply to the
    // analysis currently on screen.
    setSelectedConflicts(new Set());
    if (result.ok) setAnalysis(result.analysis);
    else {
      setAnalysis(null);
      setError(result.message);
    }
  }

  async function handleConfirm() {
    if (!file || !analysis || totalToWrite === 0) return;
    setBusy(true);
    setError(undefined);
    const result = await onConfirm(file, analysis.importableFingerprint, [...selectedConflicts]);
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
        disabled={busy || !file || (analysis !== null && totalToWrite === 0)}
      >
        {busy
          ? 'در حال پردازش…'
          : analysis
            ? // The action states exactly what will be written — never a vague "Import".
              [
                analysis.importableCount > 0
                  ? `درون‌ریزی ${analysis.importableCount} کارت جدید`
                  : null,
                selectedCount > 0 ? `${selectedCount} نسخه Draft جدید` : null,
              ]
                .filter(Boolean)
                .join(' + ') || 'درون‌ریزی'
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

          {analysis ? (
            <ImportPreview
              analysis={analysis}
              notImported={notImported}
              selectedConflicts={selectedConflicts}
              onToggleConflict={toggleConflict}
              selectedCount={selectedCount}
              skippedCount={skippedCount}
              invalidCount={invalidCount}
            />
          ) : null}
        </>
      )}
    </CpModal>
  );
}

function ImportPreview({
  analysis,
  notImported,
  selectedConflicts,
  onToggleConflict,
  selectedCount,
  skippedCount,
  invalidCount,
}: {
  analysis: ImportAnalysis;
  notImported: ImportAnalysisRow[];
  selectedConflicts: ReadonlySet<number>;
  onToggleConflict: (rowNumber: number) => void;
  selectedCount: number;
  skippedCount: number;
  invalidCount: number;
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

      {/* The pre-confirmation summary: exactly what the confirm will and will not do. */}
      <ul className="cp-import-statement">
        <li>
          کارت‌های جدیدی که ساخته می‌شوند: <strong>{analysis.importableCount}</strong>
        </li>
        <li>
          کارت‌های موجودی که نسخهٔ Draft جدید می‌گیرند: <strong>{selectedCount}</strong>
        </li>
        <li>
          سطرهای رد شده: <strong>{skippedCount}</strong>
        </li>
        <li>
          سطرهای نامعتبر: <strong>{invalidCount}</strong>
        </li>
      </ul>
      {analysis.importableCount === 0 && selectedCount === 0 ? (
        <p className="cp-note">
          هیچ سطری نوشته نمی‌شود. فایل را اصلاح کنید، یا سطرهای در تعارض را برای ساخت نسخهٔ Draft
          جدید انتخاب کنید.
        </p>
      ) : null}

      {notImported.length > 0 ? (
        <div className="cp-import-issues">
          <h4>سطرهایی که به‌صورت پیش‌فرض نوشته نمی‌شوند</h4>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">نسخهٔ Draft جدید</th>
                <th scope="col">سطر</th>
                <th scope="col">واژه</th>
                <th scope="col">وضعیت</th>
                <th scope="col">دلیل</th>
              </tr>
            </thead>
            <tbody>
              {notImported.map((row) => {
                // Only a real conflict with a known target card can be overridden. Duplicates and
                // invalid rows are never selectable.
                const selectable = row.classification === 'existing' && Boolean(row.existingCardId);
                const checked = selectable && selectedConflicts.has(row.rowNumber);
                return (
                  <tr key={row.rowNumber}>
                    <td>
                      {selectable ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleConflict(row.rowNumber)}
                          aria-label={`ساخت نسخهٔ Draft جدید برای «${row.lemma || row.rowNumber}» در سطر ${row.rowNumber}`}
                        />
                      ) : (
                        <span aria-hidden="true">—</span>
                      )}
                    </td>
                    <td>{row.rowNumber}</td>
                    <td>{row.lemma || '—'}</td>
                    <td>
                      <span
                        className={`cp-import-badge ${checked ? 'is-ok' : CLASSIFICATION_TONE[row.classification]}`}
                      >
                        {checked
                          ? SELECTED_CONFLICT_LABEL
                          : CLASSIFICATION_LABEL[row.classification]}
                      </span>
                    </td>
                    <td>
                      {checked
                        ? 'نسخهٔ منتشرشده بدون تغییر می‌ماند و یک نسخهٔ Draft جدید ساخته می‌شود.'
                        : row.issues.length > 0
                          ? row.issues.map((issue) => issue.message).join(' ')
                          : '—'}
                    </td>
                  </tr>
                );
              })}
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
          : [
              `${summary.created} کارت جدید به‌صورت «پیش‌نویس» ساخته شد`,
              summary.versioned > 0
                ? `${summary.versioned} کارت موجود نسخهٔ Draft جدید گرفت`
                : null,
            ]
              .filter(Boolean)
              .join(' و ') + '.'}
      </p>
      <p className="cp-note">
        محتوای ساخته‌شده پیش‌نویس است و تا تأیید بررسی محتوا برای زبان‌آموز نمایش داده نمی‌شود.
        {summary.versioned > 0 ? ' نسخه‌های منتشرشدهٔ قبلی بدون تغییر باقی مانده‌اند.' : ''}{' '}
        {summary.skipped} سطر نوشته نشد.
      </p>
    </div>
  );
}
