'use client';

import React, { useState } from 'react';

type PhoneOtpSignInProps = {
  onAuthenticated: () => void;
};

type Step = 'phone' | 'code';

export function PhoneOtpSignIn({ onAuthenticated }: PhoneOtpSignInProps) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'error'>('idle');

  async function requestCode() {
    setState('pending');
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) throw new Error('request failed');
      setStep('code');
      setState('idle');
    } catch {
      setState('error');
    }
  }

  async function verifyCode() {
    setState('pending');
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (response.status !== 204) throw new Error('verification failed');
      onAuthenticated();
    } catch {
      setState('error');
    }
  }

  if (step === 'phone') {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card" aria-labelledby="admin-auth-otp-title">
          <span className="admin-auth-mark" aria-hidden="true">
            LB
          </span>
          <h1 id="admin-auth-otp-title">ورود با شماره موبایل</h1>
          <p>شماره موبایل مدیر را وارد کنید تا کد تأیید ارسال شود.</p>
          <input
            className="admin-auth-input"
            type="tel"
            inputMode="numeric"
            placeholder="09XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={state === 'pending'}
            dir="ltr"
          />
          <button
            type="button"
            className="admin-auth-button"
            onClick={requestCode}
            disabled={state === 'pending' || !phone.trim()}
          >
            {state === 'pending' ? 'در حال ارسال…' : 'ارسال کد'}
          </button>
          {state === 'error' ? (
            <p className="admin-auth-error" role="alert">
              ارسال کد انجام نشد. دوباره تلاش کنید.
            </p>
          ) : null}
          <p className="admin-auth-hint">کد یک‌بارمصرف ۵ رقمی به شماره شما ارسال می‌شود.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card" aria-labelledby="admin-auth-otp-code-title">
        <span className="admin-auth-mark" aria-hidden="true">
          LB
        </span>
        <h1 id="admin-auth-otp-code-title">کد تأیید</h1>
        <p>کد ۵ رقمی ارسال‌شده به {phone} را وارد کنید.</p>
        <input
          className="admin-auth-input"
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="XXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          disabled={state === 'pending'}
          dir="ltr"
          autoFocus
        />
        <button
          type="button"
          className="admin-auth-button"
          onClick={verifyCode}
          disabled={state === 'pending' || code.length !== 5}
        >
          {state === 'pending' ? 'در حال تأیید…' : 'ورود'}
        </button>
        {state === 'error' ? (
          <p className="admin-auth-error" role="alert">
            کد نادرست است یا منقضی شده. دوباره تلاش کنید.
          </p>
        ) : null}
        <button
          type="button"
          className="admin-auth-hint-link"
          onClick={() => {
            setStep('phone');
            setCode('');
            setState('idle');
          }}
        >
          ویرایش شماره
        </button>
      </section>
    </main>
  );
}
