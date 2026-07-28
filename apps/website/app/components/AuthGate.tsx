'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

interface AuthGateProps {
  onAuthenticated: () => void;
}

function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const submitPhone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = normalizeDigits(phone).replace(/\D/g, '');

    if (digits.length < 10) {
      setError('شمارهٔ موبایل را کامل وارد کن.');
      return;
    }

    setError('');
    setStage('code');
  };

  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (normalizeDigits(code).replace(/\D/g, '').length < 5) {
      setError('کد ۵ رقمی را کامل وارد کن.');
      return;
    }

    onAuthenticated();
  };

  return (
    <main className="app-shell auth-shell" data-testid="learnbox-auth">
      <header className="auth-brand">
        <span className="brand">LearnBox</span>
      </header>
      {stage === 'phone' ? (
        <section className="auth-content" aria-labelledby="auth-title">
          <h1 id="auth-title">به LearnBox خوش آمدی</h1>
          <p>برای ادامهٔ آزمایشی، شمارهٔ موبایل خودت را وارد کن.</p>
          <form className="auth-form" onSubmit={submitPhone} noValidate>
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
              />
            </div>
            {error ? (
              <p className="auth-error" id="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="primary-button" type="submit">
              ادامهٔ آزمایشی
            </button>
          </form>
          <p className="auth-prototype-notice" role="status">
            در این نسخهٔ آزمایشی، پیامکی ارسال نمی‌شود و می‌توانی در مرحلهٔ بعد هر کد ۵ رقمی را وارد
            کنی.
          </p>
          <p className="auth-note">
            با ادامه، با شرایط استفاده و سیاست حریم خصوصی LearnBox موافقت می‌کنی.
          </p>
          <Link className="auth-install-link" href="/install">
            راهنمای افزودن LearnBox به صفحهٔ اصلی گوشی
          </Link>
        </section>
      ) : (
        <section className="auth-content" aria-labelledby="code-title">
          <button className="text-button auth-back" type="button" onClick={() => setStage('phone')}>
            تغییر شماره
          </button>
          <h1 id="code-title">کد آزمایشی را وارد کن</h1>
          <p>برای ادامه، هر کد ۵ رقمی را برای شمارهٔ {phone} وارد کن.</p>
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
            />
            {error ? (
              <p className="auth-error" id="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="primary-button" type="submit">
              ورود آزمایشی به LearnBox
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
