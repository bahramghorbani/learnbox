'use client';

import { type FormEvent, useState } from 'react';

import type { InviteGateMode } from '../alpha-invite-mode';

interface InviteGateProps {
  mode: InviteGateMode;
  onInviteAccepted: () => void;
}

const consentWording =
  'LearnBox در مرحلهٔ آزمایشی محدود است. ممکن است خطا یا تغییر در تجربه ببینی. لطفاً فقط اطلاعاتی را وارد کن که برای آزمایش لازم است؛ برای گزارش مشکل می‌توانی از راه ارتباطی اعلام‌شده استفاده کنی. می‌توانی درخواست حذف دادهٔ آزمایشی‌ات را بدهی.';

export function InviteGate({ mode, onInviteAccepted }: InviteGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (mode === 'local-prototype') return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) return;

    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/invite/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (response.status === 204) {
        onInviteAccepted();
        return;
      }
      setError(inviteErrorMessage(response.status, await readErrorCode(response)));
    } catch {
      setError('ورود با دعوت‌نامه اکنون در دسترس نیست؛ دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="app-shell auth-shell" data-testid="learnbox-invite">
      <header className="auth-brand">
        <span className="brand">LearnBox</span>
      </header>
      <section className="auth-content" aria-labelledby="invite-title">
        <h1 id="invite-title">به LearnBox خوش آمدی</h1>
        <p className="auth-note" role="status">
          {consentWording}
        </p>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="invite-code">کد دعوت</label>
          <input
            id="invite-code"
            dir="ltr"
            autoComplete="one-time-code"
            inputMode="text"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setError('');
            }}
            placeholder="XXXX-XXXX"
            aria-describedby="invite-error"
            disabled={pending}
          />
          {error ? (
            <p className="auth-error" id="invite-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" type="submit" disabled={pending || !code.trim()}>
            {pending ? 'در حال بررسی…' : 'ورود به نسخهٔ آزمایشی'}
          </button>
        </form>
      </section>
    </main>
  );
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
      const error = (body as Record<string, unknown>).error;
      return typeof error === 'string' ? error : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function inviteErrorMessage(status: number, code?: string): string {
  if (code === 'invite_limited' || status === 429) {
    return 'این کد دعوت دیگر قابل استفاده نیست یا درخواست‌ها زیاد شده است؛ کمی صبر کنید.';
  }
  if (code === 'invite_invalid') {
    return 'دعوت‌نامهٔ این کد معتبر نیست.';
  }
  return 'ورود با دعوت‌نامه اکنون در دسترس نیست؛ دوباره تلاش کنید.';
}
