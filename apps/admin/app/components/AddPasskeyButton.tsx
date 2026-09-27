'use client';

import React, { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

export function AddPasskeyButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleAdd() {
    setState('loading');
    setMessage('');
    try {
      const optionsRes = await fetch('/api/auth/add-passkey/options', {
        credentials: 'same-origin',
      });
      if (!optionsRes.ok) throw new Error('خطا در دریافت تنظیمات');
      const options = await optionsRes.json();

      const registration = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/add-passkey/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: registration }),
      });
      if (!verifyRes.ok) throw new Error('خطا در تأیید');

      setState('success');
      setMessage('دستگاه جدید با موفقیت اضافه شد! حالا می‌توانید از آن دستگاه هم وارد شوید.');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'خطایی رخ داد');
    }
  }

  return (
    <div className="add-passkey-section">
      <h3>افزودن دستگاه جدید</h3>
      <p className="add-passkey-hint">
        برای ورود از دستگاه دیگر (مثلاً iPhone با Face ID)، یک Passkey جدید ثبت کنید.
      </p>
      <button
        type="button"
        className="add-passkey-button"
        onClick={handleAdd}
        disabled={state === 'loading' || state === 'success'}
      >
        {state === 'loading'
          ? 'در حال ثبت...'
          : state === 'success'
            ? '✅ ثبت شد'
            : '➕ افزودن Passkey جدید'}
      </button>
      {message && (
        <p className={`add-passkey-message ${state === 'error' ? 'error' : 'success'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
