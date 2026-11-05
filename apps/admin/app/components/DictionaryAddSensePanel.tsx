'use client';

import React, { useState } from 'react';
import { fetchWithStepUp, readCsrfToken, stepUpRefusal } from './step-up-reauth';

const fa = (n: number) => n.toLocaleString('fa-IR');

/**
 * Two AI calls per click: a generator proposes an extra sense for single-sense words, then an
 * independent reviewer (no access to the generator's reasoning) must confirm it before anything
 * is written. Only confirmed senses land, appended to the existing ones, as a queued draft.
 */
export function DictionaryAddSensePanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function run() {
    if (
      !window.confirm(
        'دو درخواست هوش مصنوعی ارسال می‌شود: یکی برای پیشنهاد معنی دوم روی حداکثر ۵۰ واژهٔ تک‌معنا، و دیگری برای بازبینی مستقل همان پیشنهادها (هزینهٔ تخمینی کمتر از چند سنت). فقط موارد تأییدشده به‌صورت پیش‌نویس ذخیره می‌شوند. ادامه می‌دهید؟',
      )
    )
      return;
    setBusy(true);
    setMessage('در حال ارسال درخواست به هوش مصنوعی… (ممکن است تا چند ده ثانیه طول بکشد)');
    try {
      const { response, stepUp } = await fetchWithStepUp('/api/dictionary/editorial/add-sense', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': readCsrfToken() ?? '',
        },
        body: JSON.stringify({ maxWords: 50 }),
      });
      const refusal = stepUpRefusal(stepUp, response.status);
      if (refusal) throw new Error(refusal);
      if (response.status === 503) throw new Error('هوش مصنوعی در این محیط فعال نیست.');
      if (response.status === 502)
        throw new Error('پاسخ هوش مصنوعی قابل استفاده نبود؛ دوباره تلاش کنید.');
      if (!response.ok) throw new Error('انجام نشد.');
      const body = (await response.json()) as {
        added: number;
        words?: { dictionaryKey: string; status: string }[];
      };
      if (!body.added) {
        setMessage('بازبین هیچ معنی تازه‌ای را تأیید نکرد؛ چیزی ذخیره نشد.');
      } else {
        const applied = (body.words ?? []).filter((w) => w.status === 'applied').length;
        setMessage(
          `${fa(applied)} واژه معنی دوم گرفت؛ هر کدام به‌صورت پیش‌نویس است و باید بازبینی و تأیید شود.`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card dictionary-release" aria-label="افزودن معنی دوم با هوش مصنوعی">
      <div className="dictionary-release-row">
        <div>
          <strong>افزودن معنی دوم با هوش مصنوعی</strong>
          <div className="muted">
            واژه‌های تک‌معنای پرکاربرد را پیدا و پیشنهاد معنی دوم می‌دهد؛ یک بازبین مستقل قبل از
            ذخیره تأیید می‌کند. نتیجه پیش‌نویس است و باید تأیید شود.
          </div>
        </div>
        <div className="dictionary-release-actions">
          <button className="btn primary" type="button" disabled={busy} onClick={() => void run()}>
            {busy ? 'در حال بررسی…' : 'بررسی ۵۰ واژهٔ بعدی'}
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
