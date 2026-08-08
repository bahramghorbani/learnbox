'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import { useState } from 'react';

type PasskeySignInProps = {
  onAuthenticated: () => void;
};

export function PasskeySignIn({ onAuthenticated }: PasskeySignInProps) {
  const [state, setState] = useState<'idle' | 'pending' | 'error'>('idle');

  async function signIn() {
    setState('pending');
    try {
      const optionsResponse = await fetch('/api/auth/login/options', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!optionsResponse.ok) throw new Error('options unavailable');
      const optionsJSON = await optionsResponse.json();
      const assertion = await startAuthentication({ optionsJSON });
      const verifyResponse = await fetch('/api/auth/login/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      if (verifyResponse.status !== 204) throw new Error('verification failed');
      onAuthenticated();
    } catch {
      setState('error');
    }
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card" aria-labelledby="admin-auth-title">
        <span className="admin-auth-mark" aria-hidden="true">
          LB
        </span>
        <h1 id="admin-auth-title">ورود مدیر LearnBox</h1>
        <p>برای ورود امن، Passkey این مدیر را با اثرانگشت، Face ID یا قفل دستگاه تأیید کنید.</p>
        <button
          type="button"
          className="admin-auth-button"
          onClick={signIn}
          disabled={state === 'pending'}
        >
          {state === 'pending' ? 'در حال تأیید امن…' : 'ورود با Passkey'}
        </button>
        {state === 'error' ? (
          <p className="admin-auth-error" role="alert">
            ورود انجام نشد. Passkey را بررسی و دوباره تلاش کنید.
          </p>
        ) : null}
        <p className="admin-auth-hint">این روش در مرورگرهای به‌روز و دارای Passkey کار می‌کند.</p>
      </section>
    </main>
  );
}
