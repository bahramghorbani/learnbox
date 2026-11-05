'use client';

import React, { useState } from 'react';
import { fetchWithStepUp, readCsrfToken, stepUpRefusal } from './step-up-reauth';

const fa = (n: number) => n.toLocaleString('fa-IR');

/**
 * Two AI calls per click: a generator checks the newest visitor error reports against each
 * word's current content and proposes a fix only where the report looks valid, then an
 * independent reviewer must confirm each fix before it is written. Only confirmed fixes land,
 * as queued drafts — same review gate as the other pilots.
 */
export function DictionaryReviewReportsPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function run() {
    if (
      !window.confirm(
        'دو درخواست هوش مصنوعی ارسال می‌شود: یکی برای بررسی تا ۱۰ گزارش خطای تازهٔ بازدیدکنندگان و پیشنهاد اصلاح، و دیگری برای بازبینی مستقل همان پیشنهادها (هزینهٔ تخمینی کمتر از چند سنت). فقط موارد تأییدشده به‌صورت پیش‌نویس ذخیره می‌شوند. ادامه می‌دهید؟',
      )
    )
      return;
    setBusy(true);
    setMessage('در حال ارسال درخواست به هوش مصنوعی… (ممکن است تا چند ده ثانیه طول بکشد)');
    try {
      const { response, stepUp } = await fetchWithStepUp(
        '/api/dictionary/editorial/review-reports',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'x-learnbox-csrf-token': readCsrfToken() ?? '',
          },
          body: JSON.stringify({ maxWords: 10 }),
        },
      );
      const refusal = stepUpRefusal(stepUp, response.status);
      if (refusal) throw new Error(refusal);
      if (response.status === 503) throw new Error('هوش مصنوعی در این محیط فعال نیست.');
      if (response.status === 502)
        throw new Error('پاسخ هوش مصنوعی قابل استفاده نبود؛ دوباره تلاش کنید.');
      if (!response.ok) throw new Error('انجام نشد.');
      const body = (await response.json()) as { added: number; words?: { status: string }[] };
      if (!body.added) {
        setMessage('بازبین هیچ اصلاحی را تأیید نکرد؛ چیزی ذخیره نشد.');
      } else {
        setMessage(
          `اصلاح ${fa(body.added)} واژه به‌صورت پیش‌نویس ساخته شد؛ هر کدام باید بازبینی و تأیید شود.`,
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card dictionary-release" aria-label="بازبینی گزارش‌های خطای واژه‌ها">
      <div className="dictionary-release-row">
        <div>
          <strong>بررسی گزارش‌های خطا</strong>
          <div className="muted">
            تازه‌ترین گزارش‌های «این واژه اشتباه است» از بازدیدکننده‌ها را می‌گیرد و در صورت صحت،
            اصلاح پیشنهاد می‌دهد؛ یک بازبین مستقل قبل از ذخیره تأیید می‌کند.
          </div>
        </div>
        <div className="dictionary-release-actions">
          <button className="btn primary" type="button" disabled={busy} onClick={() => void run()}>
            {busy ? 'در حال بررسی…' : 'بررسی ۱۰ گزارش بعدی'}
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
