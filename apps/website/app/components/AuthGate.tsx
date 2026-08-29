'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

import type { LearnerAuthMode } from '../learner-auth-mode';
import {
  normalizeOtpDigits,
  otpErrorMessage,
  readChallengeResponse,
  rememberOtpChallenge,
  validateIranianMobile,
  verifyOtpChallenges,
  type ChallengeResponse,
} from '../../lib/otp-client';

interface AuthGateProps {
  mode: LearnerAuthMode;
  onAuthenticated: () => void;
}

const otpLength = 5;

export function AuthGate({ mode, onAuthenticated }: AuthGateProps) {
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenges, setChallenges] = useState<ChallengeResponse[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const isLocalPrototype = mode === 'local-prototype';
  const isServerOtp = mode === 'server-otp';
  const latestChallenge = challenges[0] ?? null;
  const resendSeconds = latestChallenge
    ? Math.max(0, Math.ceil((Date.parse(latestChallenge.resendAvailableAt) - now) / 1_000))
    : 0;

  useEffect(() => {
    if (!isServerOtp || stage !== 'code') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isServerOtp, stage]);

  const requestCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!validateIranianMobile(phone)) {
      setError(
        isLocalPrototype
          ? 'شمارهٔ موبایل ایرانی را کامل وارد کن.'
          : 'شمارهٔ موبایل را کامل و درست وارد کنید.',
      );
      return;
    }

    if (isLocalPrototype) {
      setError('');
      setStage('code');
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
      if (response.status !== 201) {
        setError(otpErrorMessage(response.status, readErrorCode(body)));
        return;
      }
      const nextChallenge = readChallengeResponse(body);
      if (!nextChallenge) {
        setError('پاسخ سرویس کامل نبود؛ دوباره تلاش کنید.');
        return;
      }
      setChallenges((history) => rememberOtpChallenge(history, nextChallenge));
      setCode('');
      setNow(Date.now());
      setStage('code');
    } catch {
      setError('ارتباط با سرویس انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = normalizeOtpDigits(code);

    if (normalizedCode.length !== otpLength) {
      setError(isLocalPrototype ? 'کد ۵ رقمی را کامل وارد کن.' : 'کد ۵ رقمی را کامل وارد کنید.');
      return;
    }

    if (isLocalPrototype) {
      onAuthenticated();
      return;
    }

    if (!isServerOtp || challenges.length === 0) {
      setError('کد واردشده درست نیست یا اعتبار آن تمام شده است.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const verification = await verifyOtpChallenges(challenges, (challengeId) =>
        fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ challengeId, code: normalizedCode, phone }),
        }),
      );
      if (verification.outcome === 'success') {
        onAuthenticated();
        return;
      }
      if (verification.outcome === 'rejected') {
        setError(otpErrorMessage(400, 'verification_failed'));
        return;
      }
      const body = await readJson(verification.response);
      setError(otpErrorMessage(verification.response.status, readErrorCode(body)));
    } catch {
      setError('ارتباط با سرویس انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  };

  const resetToPhone = () => {
    setStage('phone');
    setCode('');
    setChallenges([]);
    setError('');
  };

  return (
    <main className="app-shell auth-shell" data-testid="learnbox-auth">
      <header className="auth-brand">
        <span className="brand">LearnBox</span>
      </header>
      {stage === 'phone' ? (
        <section className="auth-content" aria-labelledby="auth-title">
          <h1 id="auth-title">به LearnBox خوش آمدی</h1>
          <p>
            {isLocalPrototype
              ? 'برای ادامهٔ آزمایشی، شمارهٔ موبایل خودت را وارد کن.'
              : 'برای ادامه، شمارهٔ موبایل خودت را وارد کن.'}
          </p>
          <form className="auth-form" onSubmit={requestCode} noValidate>
            <label htmlFor="mobile-number">شمارهٔ موبایل</label>
            <div className="phone-input-row">
              <span dir="ltr">+98</span>
              <input
                id="mobile-number"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setError('');
                }}
                placeholder="۹۱۲ ۱۲۳ ۴۵۶۷"
                aria-describedby="auth-error"
                disabled={pending}
              />
            </div>
            {error ? (
              <p className="auth-error" id="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="primary-button" type="submit" disabled={pending}>
              {isLocalPrototype ? 'ادامهٔ آزمایشی' : pending ? 'در حال ارسال…' : 'ارسال کد ورود'}
            </button>
          </form>
          {isLocalPrototype ? (
            <p className="auth-prototype-notice" role="status">
              در این نسخهٔ آزمایشی، پیامکی ارسال نمی‌شود و می‌توانی در مرحلهٔ بعد هر کد ۵ رقمی را
              وارد کنی.
            </p>
          ) : (
            <p className="auth-note" role="status">
              کد ورود فقط برای همین شماره ارسال می‌شود.
            </p>
          )}
          <p className="auth-note">
            با ادامه، با شرایط استفاده و سیاست حریم خصوصی LearnBox موافقت می‌کنی.
          </p>
          <Link className="auth-install-link" href="/install">
            راهنمای افزودن LearnBox به صفحهٔ اصلی گوشی
          </Link>
        </section>
      ) : (
        <section className="auth-content" aria-labelledby="code-title">
          <button
            className="text-button auth-back"
            type="button"
            onClick={resetToPhone}
            disabled={pending}
          >
            تغییر شماره
          </button>
          <h1 id="code-title">
            {isLocalPrototype ? 'کد آزمایشی را وارد کن' : 'کد پیامک‌شده را وارد کن'}
          </h1>
          <p>
            {isLocalPrototype ? (
              `برای ادامه، هر کد ۵ رقمی را برای شمارهٔ ${phone} وارد کن.`
            ) : (
              <>
                کد ۵ رقمی ارسال‌شده به شمارهٔ <bdi dir="ltr">{maskPhone(phone)}</bdi> را وارد کن.
              </>
            )}
          </p>
          <form className="auth-form" onSubmit={submitCode} noValidate>
            <label htmlFor="login-code">کد ورود</label>
            <input
              className="auth-code"
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError('');
              }}
              placeholder="— — — — —"
              aria-describedby="auth-error"
              disabled={pending}
            />
            {error ? (
              <p className="auth-error" id="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="primary-button" type="submit" disabled={pending}>
              {isLocalPrototype
                ? 'ورود آزمایشی به LearnBox'
                : pending
                  ? 'در حال بررسی…'
                  : 'تأیید کد'}
            </button>
          </form>
          {!isLocalPrototype ? (
            <button
              className="text-button auth-back"
              type="button"
              onClick={() => void requestCode()}
              disabled={pending || resendSeconds > 0}
            >
              {pending
                ? 'در حال ارسال…'
                : resendSeconds > 0
                  ? `ارسال دوباره تا ${toPersianDigits(resendSeconds)} ثانیهٔ دیگر`
                  : 'ارسال دوبارهٔ کد'}
            </button>
          ) : null}
        </section>
      )}
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
