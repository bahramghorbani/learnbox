'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';
import { DictionaryFeedbackPanel } from './DictionaryFeedbackPanel';
import { DictionaryReleasePanel } from './DictionaryReleasePanel';
import { DictionaryTranslationPilotPanel } from './DictionaryTranslationPilotPanel';
import { DictionaryAddSensePanel } from './DictionaryAddSensePanel';
import { DictionaryDraftMissingWordsPanel } from './DictionaryDraftMissingWordsPanel';
import { DictionaryReviewReportsPanel } from './DictionaryReviewReportsPanel';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import {
  createIdempotencyKey,
  fetchWithStepUp,
  readCsrfToken,
  stepUpRefusal,
} from './step-up-reauth';

type Status = 'queued' | 'approved' | 'deleted';
type Payload = Record<string, unknown>;
type Entry = {
  id: string;
  dictionaryKey: string;
  aiPayload: Payload;
  manualPayload: Payload | null;
  status: Status;
  revision: number;
  source: string;
  model: string | null;
  costMetadata: Record<string, unknown>;
  updatedAt: string;
};
type Filter = 'all' | 'review' | 'ai' | 'deleted';
type Sense = { fa: string; hint: string };
type Example = { de: string; fa: string };
type Form = { article: string; pos: string; senses: Sense[]; examples: Example[] };

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'همهٔ واژه‌ها' },
  { key: 'review', label: 'نیاز به نگاه' },
  { key: 'ai', label: 'افزودهٔ هوش مصنوعی' },
  { key: 'deleted', label: 'حذف‌شده' },
];
const posLabels: Record<string, string> = {
  noun: 'اسم',
  verb: 'فعل',
  adj: 'صفت',
  adv: 'قید',
  pron: 'ضمیر',
  prep: 'حرف اضافه',
  conj: 'حرف ربط',
  num: 'عدد',
  particle: 'ادات',
  intj: 'صوت',
  phrase: 'عبارت',
  name: 'نام خاص',
  abbrev: 'کوته‌نوشت',
};
// Older AI drafts spell some parts of speech out; editing normalises them to the release codes.
const posAliases: Record<string, string> = {
  adverb: 'adv',
  adjective: 'adj',
  pronoun: 'pron',
  preposition: 'prep',
  conjunction: 'conj',
};
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const list = (value: unknown) => (Array.isArray(value) ? (value as Payload[]) : []);

const effective = (item: Entry) => item.manualPayload ?? item.aiPayload;
const needsLook = (item: Entry) =>
  item.status !== 'deleted' && !item.manualPayload && item.costMetadata.reviewVerdict === 'fixed';

/** The release shape uses `examples`; AI drafts carry one `example`. The form edits both as a list. */
function toForm(payload: Payload): Form {
  const examples = Array.isArray(payload.examples)
    ? list(payload.examples)
    : payload.example
      ? [payload.example as Payload]
      : [];
  return {
    article: text(payload.article),
    pos: posAliases[text(payload.pos)] ?? text(payload.pos),
    senses: list(payload.senses).map((s) => ({ fa: text(s.fa), hint: text(s.hint) })),
    examples: examples.map((e) => ({ de: text(e.de), fa: text(e.fa) })),
  };
}
function fromForm(base: Payload, lemma: string, form: Form): Payload {
  const rest = { ...base };
  delete rest.example;
  return {
    ...rest,
    lemma,
    article: form.article || null,
    pos: form.pos || null,
    senses: form.senses
      .filter((s) => s.fa.trim())
      .map((s) => ({ fa: s.fa.trim(), hint: s.hint.trim() })),
    examples: form.examples
      .filter((e) => e.de.trim())
      .map((e) => ({ de: e.de.trim(), fa: e.fa.trim() || null })),
  };
}
const emptyForm = (): Form => ({
  article: '',
  pos: '',
  senses: [{ fa: '', hint: '' }],
  examples: [],
});

export function DictionaryEditorialWorkspace() {
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Entry | 'new'>();
  const [lemma, setLemma] = useState('');
  const [form, setForm] = useState<Form>(emptyForm);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'disabled' | 'error'>('loading');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query: string, by: Filter) => {
    try {
      const params = new URLSearchParams({ q: query, filter: by });
      const response = await fetch(`/api/dictionary/editorial?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) return setPhase('disabled');
      if (!response.ok) throw new Error('unavailable');
      const result = (await response.json()) as { items?: Entry[]; total?: number };
      setItems(result.items ?? []);
      setTotal(result.total ?? 0);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(q.trim(), filter), 250);
    return () => clearTimeout(timer);
  }, [load, q, filter]);

  function open(item: Entry | 'new') {
    setSelected(item);
    setMessage(undefined);
    setLemma(item === 'new' ? q.trim() : item.dictionaryKey);
    setForm(item === 'new' ? emptyForm() : toForm(effective(item)));
  }
  const edit = (change: Partial<Form>) => setForm((current) => ({ ...current, ...change }));

  async function send(url: string, method: 'POST' | 'PATCH', body: Payload) {
    setBusy(true);
    setMessage(undefined);
    try {
      const { response, stepUp } = await fetchWithStepUp(url, {
        method,
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': readCsrfToken() ?? '',
          'idempotency-key': createIdempotencyKey(),
        },
        body: JSON.stringify(body),
      });
      const refusal = stepUpRefusal(stepUp, response.status);
      if (refusal) throw new Error(refusal);
      if (response.status === 409)
        throw new Error(
          method === 'POST'
            ? 'این واژه از قبل در واژه‌نامه هست؛ آن را جست‌وجو و ویرایش کنید.'
            : 'این واژه هم‌زمان جای دیگری تغییر کرده است؛ دوباره بازش کنید.',
        );
      if (!response.ok) throw new Error('ذخیره انجام نشد.');
      const { item } = (await response.json()) as { item: Entry };
      setItems((current) =>
        current.some((x) => x.id === item.id)
          ? current.map((x) => (x.id === item.id ? item : x))
          : [item, ...current],
      );
      setSelected(item);
      setForm(toForm(effective(item)));
      setMessage('ذخیره شد.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ذخیره انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!form.senses.some((s) => s.fa.trim())) return setMessage('دست‌کم یک معنی فارسی لازم است.');
    if (selected === 'new') {
      const key = lemma.trim();
      if (!key) return setMessage('واژهٔ آلمانی را بنویسید.');
      return void send('/api/dictionary/editorial', 'POST', {
        dictionaryKey: key,
        aiPayload: fromForm({}, key, form),
        source: 'admin-manual',
        status: 'approved',
      });
    }
    if (!selected) return;
    // An admin edit is the final word: it is saved approved, with no second review step.
    void patch(selected, {
      manualPayload: fromForm(effective(selected), selected.dictionaryKey, form),
      ...(selected.status === 'queued' ? { status: 'approved' } : {}),
    });
  }
  const patch = (item: Entry, change: Payload) =>
    send(`/api/dictionary/editorial/${item.id}`, 'PATCH', { revision: item.revision, ...change });

  if (phase === 'loading') return <LoadingState label="در حال خواندن واژه‌نامه…" />;
  if (phase === 'disabled')
    return (
      <ErrorState
        tone="grey"
        title="ویرایش واژه‌نامه در این محیط فعال نیست."
        description="این قابلیت به‌طور پیش‌فرض غیرفعال است."
      />
    );
  if (phase === 'error')
    return (
      <ErrorState
        tone="rose"
        title="واژه‌نامه خوانده نشد."
        description="بدون پاسخ سرور، هیچ داده‌ای نمایش داده نمی‌شود."
        action={
          <button className="btn" type="button" onClick={() => void load(q.trim(), filter)}>
            تلاش دوباره
          </button>
        }
      />
    );

  const current = selected && selected !== 'new' ? selected : undefined;
  const preview = selected ? fromForm({}, lemma, form) : undefined;

  return (
    <main className="admin-shell cp-workspace" id="dictionary">
      <AdminSidebar current="dictionary" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>واژه‌نامه</h1>
            <p className="muted">
              هوش مصنوعی واژه‌ها را می‌سازد، بازبینی و تأیید می‌کند. شما فقط هر جا لازم بود ویرایش،
              حذف یا اضافه کنید.
            </p>
          </div>
          <button className="btn primary" type="button" onClick={() => open('new')}>
            + واژهٔ جدید
          </button>
        </div>
        <DictionaryReleasePanel />
        <DictionaryTranslationPilotPanel />
        <DictionaryAddSensePanel />
        <DictionaryDraftMissingWordsPanel />
        <DictionaryReviewReportsPanel />
        <DictionaryFeedbackPanel onPick={setQ} />
        <div className="dictionary-layout">
          <section className="card" aria-label="فهرست واژه‌ها">
            <div className="tabs" role="tablist" aria-label="فیلتر واژه‌ها">
              {filters.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.key}
                  className={filter === tab.key ? 'tab on' : 'tab'}
                  onClick={() => setFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="toolbar">
              <input
                className="cp-input"
                type="search"
                aria-label="جست‌وجوی واژه"
                placeholder="جست‌وجو: آلمانی یا معنی فارسی"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
            <div className="card-body">
              <p className="muted dictionary-count" role="status">
                {total > items.length
                  ? `${items.length.toLocaleString('fa-IR')} از ${total.toLocaleString('fa-IR')} واژه — برای دیدن بقیه دقیق‌تر جست‌وجو کنید.`
                  : `${total.toLocaleString('fa-IR')} واژه`}
              </p>
              {items.length === 0 ? (
                <EmptyState title="واژه‌ای پیدا نشد." />
              ) : (
                <div className="list">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="list-row dictionary-entry"
                      data-dictionary-entry={item.id}
                      aria-pressed={current?.id === item.id}
                      onClick={() => open(item)}
                    >
                      <div className="list-grow">
                        <div className="list-title" dir="ltr">
                          {text(effective(item).article)} {item.dictionaryKey}
                        </div>
                        <div className="list-sub">{text(list(effective(item).senses)[0]?.fa)}</div>
                      </div>
                      {item.status === 'deleted' ? (
                        <span className="badge b-rose">حذف‌شده</span>
                      ) : needsLook(item) ? (
                        <span className="badge b-amber">نیاز به نگاه</span>
                      ) : item.model ? (
                        <span className="badge b-grey">AI</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card" aria-label="ویرایش واژه">
            {!selected ? (
              <div className="card-body">
                <EmptyState title="یک واژه را از فهرست انتخاب کنید یا واژهٔ جدید بسازید." />
              </div>
            ) : (
              <div className="card-body dictionary-editor">
                {current && needsLook(current) ? (
                  <div className="dictionary-note" role="note">
                    <strong>بازبین هوش مصنوعی این مدخل را اصلاح کرده است.</strong> نسخهٔ اصلاح‌شده
                    همین است که می‌بینید و تأیید شده؛ اگر درست است کاری لازم نیست.
                    {text(current.costMetadata.reviewIssues) ? (
                      <details>
                        <summary>یادداشت اصلی بازبین (انگلیسی)</summary>
                        <p dir="ltr">{text(current.costMetadata.reviewIssues)}</p>
                      </details>
                    ) : null}
                  </div>
                ) : null}
                <div className="cp-form-grid">
                  <div className="cp-form-row is-full">
                    <label htmlFor="dict-lemma">واژهٔ آلمانی</label>
                    <input
                      id="dict-lemma"
                      className="cp-input cp-ltr"
                      dir="ltr"
                      value={lemma}
                      readOnly={selected !== 'new'}
                      onChange={(event) => setLemma(event.target.value)}
                    />
                  </div>
                  <div className="cp-form-row">
                    <label htmlFor="dict-article">حرف تعریف</label>
                    <select
                      id="dict-article"
                      className="cp-select"
                      value={form.article}
                      onChange={(event) => edit({ article: event.target.value })}
                    >
                      <option value="">—</option>
                      <option value="der">der</option>
                      <option value="die">die</option>
                      <option value="das">das</option>
                    </select>
                  </div>
                  <div className="cp-form-row">
                    <label htmlFor="dict-pos">نوع کلمه</label>
                    <select
                      id="dict-pos"
                      className="cp-select"
                      value={form.pos}
                      onChange={(event) => edit({ pos: event.target.value })}
                    >
                      <option value="">—</option>
                      {Object.entries(posLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                      {form.pos && !posLabels[form.pos] ? (
                        <option value={form.pos}>{form.pos}</option>
                      ) : null}
                    </select>
                  </div>
                </div>

                <fieldset className="dictionary-group">
                  <legend>معنی‌ها</legend>
                  {form.senses.map((sense, index) => (
                    <div className="dictionary-pair" key={index}>
                      <input
                        className="cp-input"
                        aria-label={`معنی ${index + 1}`}
                        placeholder="معنی فارسی"
                        value={sense.fa}
                        onChange={(event) =>
                          edit({
                            senses: form.senses.map((s, i) =>
                              i === index ? { ...s, fa: event.target.value } : s,
                            ),
                          })
                        }
                      />
                      <input
                        className="cp-input"
                        aria-label={`توضیح معنی ${index + 1}`}
                        placeholder="توضیح کوتاه (اختیاری)"
                        value={sense.hint}
                        onChange={(event) =>
                          edit({
                            senses: form.senses.map((s, i) =>
                              i === index ? { ...s, hint: event.target.value } : s,
                            ),
                          })
                        }
                      />
                      <button
                        className="btn"
                        type="button"
                        aria-label={`حذف معنی ${index + 1}`}
                        onClick={() => edit({ senses: form.senses.filter((_, i) => i !== index) })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className="chip"
                    type="button"
                    onClick={() => edit({ senses: [...form.senses, { fa: '', hint: '' }] })}
                  >
                    + معنی
                  </button>
                </fieldset>

                <fieldset className="dictionary-group">
                  <legend>مثال‌ها</legend>
                  {form.examples.map((example, index) => (
                    <div className="dictionary-pair" key={index}>
                      <input
                        className="cp-input cp-ltr"
                        dir="ltr"
                        aria-label={`مثال آلمانی ${index + 1}`}
                        placeholder="جملهٔ آلمانی"
                        value={example.de}
                        onChange={(event) =>
                          edit({
                            examples: form.examples.map((e, i) =>
                              i === index ? { ...e, de: event.target.value } : e,
                            ),
                          })
                        }
                      />
                      <input
                        className="cp-input"
                        aria-label={`ترجمهٔ مثال ${index + 1}`}
                        placeholder="ترجمهٔ فارسی"
                        value={example.fa}
                        onChange={(event) =>
                          edit({
                            examples: form.examples.map((e, i) =>
                              i === index ? { ...e, fa: event.target.value } : e,
                            ),
                          })
                        }
                      />
                      <button
                        className="btn"
                        type="button"
                        aria-label={`حذف مثال ${index + 1}`}
                        onClick={() =>
                          edit({ examples: form.examples.filter((_, i) => i !== index) })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className="chip"
                    type="button"
                    onClick={() => edit({ examples: [...form.examples, { de: '', fa: '' }] })}
                  >
                    + مثال
                  </button>
                </fieldset>

                {preview ? (
                  <div className="dictionary-preview" aria-label="پیش‌نمایش">
                    <div className="muted">پیش‌نمایش</div>
                    <div className="dictionary-preview-head" dir="ltr">
                      {text(preview.article)} <strong>{lemma || '…'}</strong>
                      {preview.pos ? (
                        <span className="badge b-grey">
                          {posLabels[text(preview.pos)] ?? text(preview.pos)}
                        </span>
                      ) : null}
                    </div>
                    <ol>
                      {list(preview.senses).map((s, i) => (
                        <li key={i}>
                          {text(s.fa)}
                          {text(s.hint) ? <span className="muted"> — {text(s.hint)}</span> : null}
                        </li>
                      ))}
                    </ol>
                    {list(preview.examples).map((e, i) => (
                      <p key={i} className="dictionary-example">
                        <span dir="ltr">{text(e.de)}</span>
                        {text(e.fa) ? <span className="muted">{text(e.fa)}</span> : null}
                      </p>
                    ))}
                  </div>
                ) : null}

                {message ? (
                  <p role="status" className="hint">
                    {message}
                  </p>
                ) : null}
                <div className="head-actions">
                  {current?.status === 'deleted' ? (
                    <button
                      className="btn primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void patch(current, { status: 'approved' })}
                    >
                      بازگرداندن واژه
                    </button>
                  ) : (
                    <>
                      <button className="btn primary" type="button" disabled={busy} onClick={save}>
                        ذخیره
                      </button>
                      {current?.manualPayload ? (
                        <button
                          className="btn"
                          type="button"
                          disabled={busy}
                          onClick={() => void patch(current, { manualPayload: null })}
                        >
                          برگشت به نسخهٔ اصلی
                        </button>
                      ) : null}
                      {current ? (
                        <button
                          className="btn danger"
                          type="button"
                          disabled={busy}
                          onClick={() => void patch(current, { status: 'deleted' })}
                        >
                          حذف واژه
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
