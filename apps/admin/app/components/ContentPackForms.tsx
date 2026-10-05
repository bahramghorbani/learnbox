'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Phase 1 / Milestone 1.2 — management form surfaces.
 *
 * Markup and class names follow the frozen prototype's modal/form primitives
 * (`.scrim`/`.modal`/`.input`, re-scoped as `.cp-*`). No new visual language is introduced.
 *
 * Both forms are deliberately "dumb": they own only local field state and presentation. The
 * caller performs the mutation, so CSRF, idempotency and error mapping stay in one place.
 */

export type FieldIssue = { field: string; message: string };

export type SubmitOutcome = { ok: true } | { ok: false; message?: string; issues?: FieldIssue[] };

function issueFor(issues: FieldIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

function CpModal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  const headingId = `cp-modal-${title.replace(/\s+/g, '-')}`;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape closes, and focus moves into the dialog — the prototype's overlay behaviour.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="cp-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={wide ? 'cp-modal is-wide' : 'cp-modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={dialogRef}
      >
        <div className="cp-modal-head">
          <h3 id={headingId}>{title}</h3>
          <button type="button" className="cp-x-btn" onClick={onClose} aria-label="بستن">
            ✕
          </button>
        </div>
        <div className="cp-modal-body">{children}</div>
        <div className="cp-modal-foot">{footer}</div>
      </div>
    </div>
  );
}

function StatusBanner({ message, tone }: { message?: string; tone: 'error' | 'success' }) {
  if (!message) return null;
  return (
    <p className={`cp-form-status is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {message}
    </p>
  );
}

function TextRow({
  label,
  value,
  onChange,
  issues,
  field,
  full,
  ltr,
  placeholder,
  textarea,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  issues: FieldIssue[];
  field: string;
  full?: boolean;
  ltr?: boolean;
  placeholder?: string;
  textarea?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  const error = issueFor(issues, field);
  const id = `cp-field-${field}`;
  const className = [
    textarea ? 'cp-textarea' : 'cp-input',
    error ? 'is-invalid' : '',
    ltr ? 'cp-ltr' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={full ? 'cp-form-row is-full' : 'cp-form-row'}>
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      {textarea ? (
        <textarea
          id={id}
          className={className}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className={className}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <span className="cp-field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

const cefrOptions = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type PackFormValues = {
  packId: string;
  displayName: string;
  description: string;
  targetCefr: string;
  category: string;
  targetItemCount: string;
  isFree: boolean;
};

export const emptyPackForm: PackFormValues = {
  packId: '',
  displayName: '',
  description: '',
  targetCefr: 'A1',
  category: '',
  targetItemCount: '',
  isFree: false,
};

export function PackFormModal({
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial: PackFormValues;
  onClose: () => void;
  onSubmit: (values: PackFormValues) => Promise<SubmitOutcome>;
}) {
  const [values, setValues] = useState(initial);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function update<Key extends keyof PackFormValues>(key: Key, value: PackFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setPending(true);
    setError(undefined);
    setIssues([]);
    const outcome = await onSubmit(values);
    setPending(false);
    if (outcome.ok) {
      onClose();
      return;
    }
    setIssues(outcome.issues ?? []);
    setError(outcome.message);
  }

  const title = mode === 'create' ? 'افزودن بستهٔ جدید' : 'ویرایش بسته';

  return (
    <CpModal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn primary" onClick={submit} disabled={pending}>
            {pending ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            انصراف
          </button>
        </>
      }
    >
      <StatusBanner message={error} tone="error" />
      <div className="cp-form-grid">
        <TextRow
          label="شناسهٔ بسته"
          field="packId"
          value={values.packId}
          onChange={(value) => update('packId', value)}
          issues={issues}
          ltr
          required
          placeholder="learnbox-a1-home"
          // The canonical id is immutable once the pack exists.
          disabled={mode === 'edit' || pending}
        />
        <TextRow
          label="نام نمایشی"
          field="displayName"
          value={values.displayName}
          onChange={(value) => update('displayName', value)}
          issues={issues}
          required
          disabled={pending}
        />
        <div className="cp-form-row">
          <label htmlFor="cp-field-targetCefr">سطح</label>
          <select
            id="cp-field-targetCefr"
            className="cp-select"
            value={values.targetCefr}
            disabled={pending}
            onChange={(event) => update('targetCefr', event.target.value)}
          >
            {cefrOptions.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <TextRow
          label="دسته‌بندی"
          field="category"
          value={values.category}
          onChange={(value) => update('category', value)}
          issues={issues}
          disabled={pending}
        />
        <TextRow
          label="تعداد هدف"
          field="targetItemCount"
          value={values.targetItemCount}
          onChange={(value) => update('targetItemCount', value)}
          issues={issues}
          ltr
          disabled={pending}
        />
        <div className="cp-form-row">
          <label htmlFor="cp-field-isFree">دسترسی</label>
          <select
            id="cp-field-isFree"
            className="cp-select"
            value={values.isFree ? 'free' : 'paid'}
            disabled={pending}
            onChange={(event) => update('isFree', event.target.value === 'free')}
          >
            <option value="paid">غیررایگان</option>
            <option value="free">رایگان</option>
          </select>
        </div>
        <TextRow
          label="توضیح"
          field="description"
          value={values.description}
          onChange={(value) => update('description', value)}
          issues={issues}
          textarea
          full
          disabled={pending}
        />
      </div>
      <p className="cp-note">
        بستهٔ تازه به‌صورت «پیش‌نویس» ساخته می‌شود. انتشار از مسیر بررسی و انتشار canonical انجام
        می‌شود و در این بخش در دسترس نیست.
      </p>
    </CpModal>
  );
}

export type CardFormValues = {
  lemma: string;
  article: string;
  partOfSpeech: string;
  essentialInflection: string;
  pronunciationIpa: string;
  persianMeanings: string;
  exampleGerman: string;
  examplePersian: string;
  simpleGermanDefinition: string;
  grammarNote: string;
  topicTags: string;
  difficulty: string;
  cefr: string;
  visualConcept: string;
  imagePrompt: string;
  sourceReference: string;
};

export const emptyCardForm: CardFormValues = {
  lemma: '',
  article: '',
  partOfSpeech: 'noun',
  essentialInflection: '',
  pronunciationIpa: '',
  persianMeanings: '',
  exampleGerman: '',
  examplePersian: '',
  simpleGermanDefinition: '',
  grammarNote: '',
  topicTags: '',
  difficulty: '1',
  cefr: 'A1',
  visualConcept: '',
  imagePrompt: '',
  sourceReference: '',
};

const partOfSpeechOptions: Array<[string, string]> = [
  ['noun', 'اسم'],
  ['verb', 'فعل'],
  ['adjective', 'صفت'],
  ['adverb', 'قید'],
  ['phrase', 'عبارت'],
  ['other', 'سایر'],
];

export function CardFormModal({
  mode,
  initial,
  packLabel,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial: CardFormValues;
  packLabel: string;
  onClose: () => void;
  onSubmit: (values: CardFormValues) => Promise<SubmitOutcome>;
}) {
  const [values, setValues] = useState(initial);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function update<Key extends keyof CardFormValues>(key: Key, value: CardFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setPending(true);
    setError(undefined);
    setIssues([]);
    const outcome = await onSubmit(values);
    setPending(false);
    if (outcome.ok) {
      onClose();
      return;
    }
    setIssues(outcome.issues ?? []);
    setError(outcome.message);
  }

  const title = mode === 'create' ? `افزودن کارت به ${packLabel}` : 'ویرایش کارت';

  return (
    <CpModal
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn primary" onClick={submit} disabled={pending}>
            {pending ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            انصراف
          </button>
        </>
      }
    >
      <StatusBanner message={error} tone="error" />
      <div className="cp-form-grid">
        <TextRow
          label="واژهٔ آلمانی"
          field="lemma"
          value={values.lemma}
          onChange={(value) => update('lemma', value)}
          issues={issues}
          ltr
          required
          disabled={pending}
        />
        <div className="cp-form-row">
          <label htmlFor="cp-field-article">حرف تعریف</label>
          <select
            id="cp-field-article"
            className="cp-select cp-ltr"
            value={values.article}
            disabled={pending}
            onChange={(event) => update('article', event.target.value)}
          >
            <option value="">—</option>
            <option value="der">der</option>
            <option value="die">die</option>
            <option value="das">das</option>
          </select>
        </div>
        <div className="cp-form-row">
          <label htmlFor="cp-field-partOfSpeech">نقش دستوری</label>
          <select
            id="cp-field-partOfSpeech"
            className="cp-select"
            value={values.partOfSpeech}
            disabled={pending}
            onChange={(event) => update('partOfSpeech', event.target.value)}
          >
            {partOfSpeechOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <TextRow
          label="جمع / صرف کلیدی"
          field="essentialInflection"
          value={values.essentialInflection}
          onChange={(value) => update('essentialInflection', value)}
          issues={issues}
          ltr
          placeholder="die Tische"
          disabled={pending}
        />
        <TextRow
          label="تلفظ (IPA)"
          field="pronunciationIpa"
          value={values.pronunciationIpa}
          onChange={(value) => update('pronunciationIpa', value)}
          issues={issues}
          ltr
          disabled={pending}
        />
        <TextRow
          label="معنی فارسی (با ویرگول جدا کنید)"
          field="persianMeanings"
          value={values.persianMeanings}
          onChange={(value) => update('persianMeanings', value)}
          issues={issues}
          required
          disabled={pending}
        />
        <TextRow
          label="مثال آلمانی"
          field="examples"
          value={values.exampleGerman}
          onChange={(value) => update('exampleGerman', value)}
          issues={issues}
          ltr
          full
          required
          disabled={pending}
        />
        <TextRow
          label="ترجمهٔ فارسی مثال"
          field="examplePersian"
          value={values.examplePersian}
          onChange={(value) => update('examplePersian', value)}
          issues={issues}
          full
          required
          disabled={pending}
        />
        <TextRow
          label="تعریف سادهٔ آلمانی"
          field="simpleGermanDefinition"
          value={values.simpleGermanDefinition}
          onChange={(value) => update('simpleGermanDefinition', value)}
          issues={issues}
          ltr
          full
          textarea
          required
          disabled={pending}
        />
        <TextRow
          label="نکتهٔ دستوری"
          field="grammarNote"
          value={values.grammarNote}
          onChange={(value) => update('grammarNote', value)}
          issues={issues}
          full
          textarea
          required
          disabled={pending}
        />
        <TextRow
          label="برچسب موضوعی (با ویرگول)"
          field="topicTags"
          value={values.topicTags}
          onChange={(value) => update('topicTags', value)}
          issues={issues}
          required
          disabled={pending}
        />
        <div className="cp-form-row">
          <label htmlFor="cp-field-difficulty">سختی (۱ تا ۵)</label>
          <select
            id="cp-field-difficulty"
            className="cp-select"
            value={values.difficulty}
            disabled={pending}
            onChange={(event) => update('difficulty', event.target.value)}
          >
            {['1', '2', '3', '4', '5'].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <TextRow
          label="توصیف تصویری"
          field="visualConcept"
          value={values.visualConcept}
          onChange={(value) => update('visualConcept', value)}
          issues={issues}
          full
          textarea
          required
          disabled={pending}
        />
        <TextRow
          label="پرامپت تصویر"
          field="imagePrompt"
          value={values.imagePrompt}
          onChange={(value) => update('imagePrompt', value)}
          issues={issues}
          full
          textarea
          required
          disabled={pending}
        />
        <TextRow
          label="مرجع"
          field="sourceReference"
          value={values.sourceReference}
          onChange={(value) => update('sourceReference', value)}
          issues={issues}
          full
          required
          disabled={pending}
        />
      </div>
      <p className="cp-note">
        ذخیره یک نسخهٔ «پیش‌نویس» canonical می‌سازد یا به‌روزرسانی می‌کند. اگر نسخهٔ فعلی از مرحلهٔ
        پیش‌نویس گذشته باشد، نسخهٔ تازه‌ای ساخته می‌شود و محتوای بررسی‌شده دست‌نخورده می‌ماند.
      </p>
    </CpModal>
  );
}
