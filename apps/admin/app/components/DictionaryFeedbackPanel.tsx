'use client';

import React, { useEffect, useState } from 'react';

type Summary = {
  misses: { q: string; count: number; last: string }[];
  reports: { lemma: string; kind: string; note: string; at: string }[];
  missTotal: number;
  reportTotal: number;
};
const kindLabels: Record<string, string> = {
  meaning: 'معنی',
  example: 'مثال',
  article: 'حرف تعریف / نوع کلمه',
  other: 'دیگر',
};
const fa = (n: number) => n.toLocaleString('fa-IR');
const when = (iso: string) => new Date(iso).toLocaleDateString('fa-IR', { dateStyle: 'medium' });

/** What visitors searched for and did not find, and what they reported as wrong. */
export function DictionaryFeedbackPanel({ onPick }: { onPick: (word: string) => void }) {
  const [data, setData] = useState<Summary | 'off' | 'error'>();
  useEffect(() => {
    fetch('/api/dictionary/feedback', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) return setData('off');
        if (!r.ok) throw new Error('unavailable');
        const body = (await r.json()) as Partial<Summary>;
        if (!Array.isArray(body.misses) || !Array.isArray(body.reports)) throw new Error('shape');
        setData(body as Summary);
      })
      .catch(() => setData('error'));
  }, []);
  if (!data || data === 'off') return null;
  if (data === 'error')
    return (
      <section className="card dictionary-feedback" aria-label="بازخورد بازدیدکنندگان">
        <p className="muted">بازخورد بازدیدکنندگان خوانده نشد.</p>
      </section>
    );
  return (
    <section className="card dictionary-feedback" aria-label="بازخورد بازدیدکنندگان">
      <div>
        <h3>جست‌وجوهای بی‌نتیجه</h3>
        <p className="muted">
          {fa(data.missTotal)} جست‌وجو؛ پرتکرارها بالاترند. واژه‌هایی که منتشر شده‌اند خودکار حذف
          می‌شوند.
        </p>
        {data.misses.length ? (
          <ol className="dictionary-feedback-list">
            {data.misses.map((m) => (
              <li key={m.q}>
                <button type="button" className="link" dir="auto" onClick={() => onPick(m.q)}>
                  {m.q}
                </button>{' '}
                <span className="muted">
                  {fa(m.count)} بار · {when(m.last)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">هنوز موردی نیست.</p>
        )}
      </div>
      <div>
        <h3>گزارش‌های کاربران</h3>
        <p className="muted">{fa(data.reportTotal)} گزارش؛ تازه‌ترها بالاترند.</p>
        {data.reports.length ? (
          <ul className="dictionary-feedback-list">
            {data.reports.map((r) => (
              <li key={`${r.lemma}-${r.at}`}>
                <button type="button" className="link" dir="ltr" onClick={() => onPick(r.lemma)}>
                  {r.lemma}
                </button>{' '}
                <span className="muted">
                  {kindLabels[r.kind] ?? r.kind} · {when(r.at)}
                </span>
                {r.note ? <div dir="auto">{r.note}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">هنوز گزارشی نرسیده.</p>
        )}
      </div>
    </section>
  );
}
