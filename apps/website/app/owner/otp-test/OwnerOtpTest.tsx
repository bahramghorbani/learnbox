'use client';

import { type FormEvent, useEffect, useState } from 'react';

import {
  normalizeOtpDigits,
  otpErrorMessage,
  readChallengeResponse,
  validateIranianMobile,
  type ChallengeResponse,
} from './owner-otp-test';

type Stage = 'phone' | 'code' | 'success';

export function OwnerOtpTest() {
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (stage !== 'code') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const resendSeconds = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAvailableAt) - now) / 1_000))
    : 0;

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!validateIranianMobile(phone)) {
      setError('شمارهٔ موبایل را کامل و درست وارد کنید.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body = await readJson(response);
      if (!response.ok) {
        setError(otpErrorMessage(response.status, readErrorCode(body)));
        return;
      }
      const nextChallenge = readChallengeResponse(body);
      if (!nextChallenge) {
        setError('پاسخ سرویس کامل نبود؛ دوباره تلاش کنید.');
        return;
      }
      setChallenge(nextChallenge);
      setCode('');
      setNow(Date.now());
      setStage('code');
    } catch {
      setError('ارتباط با سرویس انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = normalizeOtpDigits(code);
    if (!challenge || normalizedCode.length !== 5) {
      setError('کد ۵ رقمی را کامل وارد کنید.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.challengeId, code: normalizedCode }),
      });
      if (!response.ok) {
        const body = await readJson(response);
        setError(otpErrorMessage(response.status, readErrorCode(body)));
        return;
      }
      setPhone('');
      setCode('');
      setChallenge(null);
      setStage('success');
    } catch {
      setError('ارتباط با سرویس انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="owner-otp-shell">
      <section className="owner-otp-card" aria-labelledby="owner-otp-title">
        <div className="owner-otp-brand" dir="ltr" aria-label="LearnBox">
          <span aria-hidden="true">LB</span>
          LearnBox
        </div>
        <p className="owner-otp-eyebrow">آزمون محافظت‌شدهٔ مالک</p>

        {stage === 'phone' ? (
          <>
            <h1 id="owner-otp-title">ارسال کد ورود</h1>
            <p className="owner-otp-description">
              شمارهٔ خودتان را وارد کنید. یک پیامک واقعی از قالب تأییدشدهٔ LearnBox ارسال می‌شود.
            </p>
            <form className="owner-otp-form" onSubmit={requestCode} noValidate>
              <label htmlFor="owner-mobile">شمارهٔ موبایل</label>
              <input
                id="owner-mobile"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setError('');
                }}
                placeholder="0912 123 4567"
                aria-describedby="owner-otp-status"
                autoFocus
              />
              <button type="submit" disabled={pending}>
                {pending ? 'در حال ارسال…' : 'ارسال کد تأیید'}
              </button>
            </form>
          </>
        ) : null}

        {stage === 'code' ? (
          <>
            <button
              className="owner-otp-back"
              type="button"
              onClick={() => {
                setStage('phone');
                setChallenge(null);
                setCode('');
                setError('');
              }}
              disabled={pending}
            >
              تغییر شماره
            </button>
            <h1 id="owner-otp-title">کد پیامک‌شده را وارد کنید</h1>
            <p className="owner-otp-description">
              کد پنج‌رقمی ارسال‌شده به شمارهٔ <bdi dir="ltr">{maskPhone(phone)}</bdi> را وارد کنید.
            </p>
            <form className="owner-otp-form" onSubmit={verifyCode} noValidate>
              <label htmlFor="owner-code">کد تأیید</label>
              <input
                className="owner-otp-code"
                id="owner-code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={5}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setError('');
                }}
                placeholder="•••••"
                aria-describedby="owner-otp-status"
                autoFocus
              />
              <button type="submit" disabled={pending}>
                {pending ? 'در حال بررسی…' : 'تأیید کد'}
              </button>
            </form>
            <button
              className="owner-otp-resend"
              type="button"
              disabled={pending || resendSeconds > 0}
              onClick={() => void requestCode()}
            >
              {resendSeconds > 0
                ? `ارسال دوباره تا ${toPersianDigits(resendSeconds)} ثانیهٔ دیگر`
                : 'ارسال دوبارهٔ کد'}
            </button>
          </>
        ) : null}

        {stage === 'success' ? (
          <div className="owner-otp-success" role="status">
            <span aria-hidden="true">✓</span>
            <h1 id="owner-otp-title">تست پیامک موفق بود</h1>
            <p>کد تأیید شد و نشست امن LearnBox با موفقیت ساخته شد.</p>
          </div>
        ) : null}

        <p
          className={error ? 'owner-otp-status owner-otp-status-error' : 'owner-otp-status'}
          id="owner-otp-status"
          role={error ? 'alert' : 'status'}
          aria-live="polite"
        >
          {error}
        </p>
        <p className="owner-otp-privacy">شماره و کد شما در این صفحه ذخیره یا ثبت نمی‌شود.</p>
      </section>
    </main>
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorCode(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const error = (value as Record<string, unknown>).error;
  return typeof error === 'string' ? error : undefined;
}

function maskPhone(value: string): string {
  const digits = normalizeOtpDigits(value);
  if (digits.length < 7) return '•••••••••••';
  return `${digits.slice(0, 4)}•••${digits.slice(-4)}`;
}

function toPersianDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit);
}
