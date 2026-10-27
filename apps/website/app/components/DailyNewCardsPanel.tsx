'use client';

import { useEffect, useState } from 'react';
import {
  DAILY_NEW_CARD_ALLOWANCE,
  DAILY_NEW_CARD_ALLOWANCE_OPTIONS,
  type DailyNewCardAllowance,
} from '@learnbox/learning-engine';

const endpoint = '/api/learner/learning-preferences';
const readEndpoint = `${endpoint}/details`;

export function DailyNewCardsPanel() {
  const [value, setValue] = useState<DailyNewCardAllowance>(DAILY_NEW_CARD_ALLOWANCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetch(readEndpoint, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('read failed');
        const body = (await response.json()) as { dailyNewCardAllowance?: unknown };
        if (
          body.dailyNewCardAllowance === 3 ||
          body.dailyNewCardAllowance === 7 ||
          body.dailyNewCardAllowance === 12
        ) {
          if (!cancelled) setValue(body.dailyNewCardAllowance);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('بازیابی تنظیم ورود کارت‌های جدید ممکن نشد.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = (next: DailyNewCardAllowance) => {
    setValue(next);
    setSaving(true);
    setStatus('');
    void fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ dailyNewCardAllowance: next }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('save failed');
        const body = (await response.json()) as { dailyNewCardAllowance?: unknown };
        if (body.dailyNewCardAllowance !== next) throw new Error('invalid response');
        setStatus('ذخیره شد؛ از شروع روز بعد اعمال می‌شود.');
      })
      .catch(() => {
        setStatus('ذخیرهٔ تنظیم ممکن نشد؛ دوباره تلاش کنید.');
      })
      .finally(() => setSaving(false));
  };

  return (
    <section className="settings-row settings-row-block" aria-labelledby="daily-new-cards-title">
      <span className="settings-row-copy">
        <strong id="daily-new-cards-title">کارت جدید روزانه</strong>
        <small>حداکثر کارت تازه‌ای که از روز بعد وارد چرخهٔ یادگیری می‌شود.</small>
      </span>
      <fieldset className="daily-new-card-options" disabled={loading || saving}>
        <legend className="sr-only">تعداد کارت جدید روزانه</legend>
        {DAILY_NEW_CARD_ALLOWANCE_OPTIONS.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="daily-new-card-allowance"
              checked={value === option}
              onChange={() => save(option)}
            />
            {option} کارت
          </label>
        ))}
      </fieldset>
      {status ? (
        <p
          className="settings-save-status"
          role={status.startsWith('ذخیره شد') ? 'status' : 'alert'}
        >
          {status}
        </p>
      ) : null}
    </section>
  );
}
