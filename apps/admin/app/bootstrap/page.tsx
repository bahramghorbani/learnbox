'use client';

import React, { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

export default function BootstrapPage() {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleBootstrap() {
    if (!secret.trim()) return;
    setState('pending');
    setErrorMsg('');
    try {
      const optionsRes = await fetch('/api/auth/bootstrap/options', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!optionsRes.ok) throw new Error(`Options failed: ${optionsRes.status}`);
      const optionsJSON = await optionsRes.json();
      const registration = await startRegistration({ optionsJSON });
      const verifyRes = await fetch('/api/auth/bootstrap/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: secret.trim(), response: registration }),
      });
      if (verifyRes.status === 204) {
        setState('done');
      } else {
        throw new Error(`Verification failed: ${verifyRes.status}`);
      }
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'خطای ناشناخته');
    }
  }

  if (state === 'done') {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card" aria-labelledby="bootstrap-title">
          <span className="admin-auth-mark" aria-hidden="true">
            ✅
          </span>
          <h1 id="bootstrap-title">ثبت Passkey موفق</h1>
          <p>Passkey مدیر با موفقیت ثبت شد. اکنون می‌توانید وارد شوید.</p>
          <a
            href="/"
            className="admin-auth-button"
            style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}
          >
            ورود به پنل مدیر
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card" aria-labelledby="bootstrap-title">
        <span className="admin-auth-mark" aria-hidden="true">
          🔐
        </span>
        <h1 id="bootstrap-title">ثبت اولیه Passkey مدیر</h1>
        <p>برای راه‌اندازی اولیه، کد امنیتی Bootstrap را وارد کنید.</p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="کد امنیتی Bootstrap"
          className="admin-auth-input"
          disabled={state === 'pending'}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#fff',
            fontSize: '16px',
            marginBottom: '12px',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          className="admin-auth-button"
          onClick={handleBootstrap}
          disabled={state === 'pending' || !secret.trim()}
        >
          {state === 'pending' ? 'در حال ثبت…' : 'ثبت Passkey'}
        </button>
        {state === 'error' && (
          <p className="admin-auth-error" role="alert">
            {errorMsg || 'ثبت انجام نشد. کد امنیتی را بررسی کنید.'}
          </p>
        )}
      </section>
    </main>
  );
}
