'use client';

import { startRegistration } from '@simplewebauthn/browser';
import React, { useEffect, useState } from 'react';

import type { AdminAuthMode } from '../admin-auth-mode';
import { PasskeySignIn } from './PasskeySignIn';

type AdminBootstrapProps = {
  onBootstrapped: () => void;
};

export function AdminBootstrap({ onBootstrapped }: AdminBootstrapProps) {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'error'>('idle');

  async function bootstrap() {
    setState('pending');
    try {
      const optionsResponse = await fetch('/api/auth/bootstrap/options', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!optionsResponse.ok) throw new Error('options unavailable');
      const optionsJSON = await optionsResponse.json();
      const registration = await startRegistration({ optionsJSON });
      const verifyResponse = await fetch('/api/auth/bootstrap/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret, response: registration }),
      });
      if (verifyResponse.status !== 204) throw new Error('bootstrap failed');
      setSecret('');
      setState('idle');
      onBootstrapped();
    } catch {
      setState('error');
    }
  }

  return (
    <section className="admin-auth-card" aria-labelledby="admin-bootstrap-title">
      <h2 id="admin-bootstrap-title">راه‌اندازی Passkey مدیر</h2>
      <p>کلید راه‌اندازی را فقط همین‌جا وارد کنید و سپس Face ID، Touch ID یا قفل دستگاه را تأیید کنید.</p>
      <label>
        کلید راه‌اندازی
        <input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          disabled={state === 'pending'}
        />
      </label>
      <button
        type="button"
        className="admin-auth-button"
        onClick={bootstrap}
        disabled={!secret || state === 'pending'}
      >
        {state === 'pending' ? 'در حال ثبت امن…' : 'ثبت Passkey مدیر'}
      </button>
      {state === 'error' ? (
        <p className="admin-auth-error" role="alert">راه‌اندازی انجام نشد. کلید و Passkey را بررسی کنید.</p>
      ) : null}
    </section>
  );
}


type AdminAuthGateProps = {
  mode: AdminAuthMode;
  children?: React.ReactNode;
};

export function AdminAuthGate({ mode, children }: AdminAuthGateProps) {
  const [state, setState] = useState<'checking' | 'signed-out' | 'signed-in'>(
    mode === 'local-prototype' ? 'signed-in' : 'checking',
  );

  useEffect(() => {
    if (mode === 'local-prototype') return;
    let active = true;
    void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((session) => {
        if (!active) return;
        setState(session?.authenticated ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (active) setState('signed-out');
      });
    return () => {
      active = false;
    };
  }, [mode]);

  if (mode === 'local-prototype') return <>{children}</>;
  if (state === 'checking') {
    return (
      <main className="admin-auth-loading" aria-live="polite">
        در حال بررسی ورود امن…
      </main>
    );
  }
  if (state === 'signed-out')
    return (
      <main className="admin-auth-shell">
        <AdminBootstrap onBootstrapped={() => setState('signed-out')} />
        <PasskeySignIn onAuthenticated={() => setState('signed-in')} />
      </main>
    );
  return <>{children}</>;
}
