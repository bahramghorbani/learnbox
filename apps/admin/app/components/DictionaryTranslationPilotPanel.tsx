'use client';

import React, { useState } from 'react';
import { fetchWithStepUp, readCsrfToken, stepUpRefusal } from './step-up-reauth';

const fa = (n: number) => n.toLocaleString('fa-IR');

/**
 * One AI call translates the next batch of missing Persian example sentences for the
 * highest-frequency live words. Results land as a queued draft — reviewable from the "افزودهٔ
 * هوش مصنوعی" filter below, never published automatically. This button is the paid-call gate: a
 * real AvalAI request only happens when an admin clicks it.
 */
export function DictionaryTranslationPilotPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function run() {
    if (
      !window.confirm(
        'یک درخواست هوش مصنوعی برای ترجمهٔ حداکثر ۵۰ جملهٔ نمونهٔ بدون ترجمه ارسال می‌شود (هزینهٔ تخمینی کمتر از چند سنت). نتیجه فقط به‌صورت پیش‌نویس ذخیره می‌شود و تا تأیید دستی روی سایت نمی‌رود. ادامه می‌دهید؟',
      )
    )
      return;
    setBusy(true);
    setMessage(undefined);
    try {
      const { response, stepUp } = await fetchWithStepUp(
        '/api/dictionary/editorial/translate-examples',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-learnbox-csrf-token': readCsrfToken() ?? '',
          },
          body: JSON.stringify({ maxSentences: 50 }),
        },
      );
      const refusal = stepUpRefusal(stepUp, response.status);
      if (refusal) throw new Error(refusal);
      if (response.status === 503) throw new Error('هوش مصنوعی در این محیط فعال نیست.');
      if (response.status === 502)
        throw new Error('پاسخ هوش مصنوعی قابل استفاده نبود؛ دوباره تلاش کنید.');
      if (!response.ok) throw new Error('انجام نشد.');
      const body = (await response.json()) as {
        translated: number;
        words?: { dictionaryKey: string; status: string }[];
      };
      if (!body.translated) {
        setMessage('هیچ جملهٔ بدون ترجمه‌ای پیدا نشد.');
      } else {
        const applied = (body.words ?? []).filter((w) => w.status === 'applied').length;
        setMessage(
          `${fa(body.translated)} جمله ترجمه شد روی ${fa(applied)} واژه؛ هر کدام در فهرست به‌صورت پیش‌نویس است و باید بازبینی و تأیید شود.`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card dictionary-release" aria-label="ترجمهٔ جمله‌های نمونه با هوش مصنوعی">
      <div className="dictionary-release-row">
        <div>
          <strong>ترجمهٔ جمله‌های نمونه با هوش مصنوعی</strong>
          <div className="muted">
            پرکاربردترین واژه‌هایی که جملهٔ نمونهٔ آلمانی دارند ولی ترجمهٔ فارسی ندارند را پیدا و
            ترجمه می‌کند (هر بار حداکثر ۵۰ جمله). نتیجه پیش‌نویس است و باید تأیید شود.
          </div>
        </div>
        <div className="dictionary-release-actions">
          <button className="btn primary" type="button" disabled={busy} onClick={() => void run()}>
            {busy ? 'در حال ترجمه…' : 'ترجمهٔ ۵۰ جملهٔ بعدی'}
          </button>
        </div>
      </div>
      {message ? (
        <p className="dictionary-release-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
