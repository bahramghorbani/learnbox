'use client';

import { useState } from 'react';

type IssuedInvite = { code: string; expiresAt: string };

export function OwnerAlphaInviteTest() {
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function issueInvite() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/owner/alpha-invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const body = await readJson(response);
      if (!response.ok || !isIssuedInvite(body)) {
        setError('ساخت کد انجام نشد. بعداً دوباره تلاش کنید.');
        return;
      }
      setIssued(body);
    } catch {
      setError('ارتباط با سرویس انجام نشد. بعداً دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="owner-otp-shell">
      <section className="owner-otp-card" aria-labelledby="owner-invite-title">
        <div className="owner-otp-brand" dir="ltr" aria-label="LearnBox">
          <span aria-hidden="true">LB</span>
          LearnBox
        </div>
        <p className="owner-otp-eyebrow">آزمون محافظت‌شدهٔ مالک</p>
        <h1 id="owner-invite-title">کد یک‌بارمصرف آزمون آلفا</h1>
        {!issued ? (
          <>
            <p className="owner-otp-description">
              این کد فقط برای آزمون شما ساخته می‌شود، یک‌بار قابل استفاده است و پس از ۳۰ دقیقه منقضی
              می‌شود.
            </p>
            <button
              className="owner-otp-issue"
              type="button"
              onClick={() => void issueInvite()}
              disabled={pending}
            >
              {pending ? 'در حال ساخت…' : 'ساخت کد آزمون'}
            </button>
          </>
        ) : (
          <div className="owner-otp-success" role="status">
            <span aria-hidden="true">✓</span>
            <h2>کد آماده است</h2>
            <p>کد را فقط در صفحهٔ ورود همین پیش‌نمایش وارد کنید. این صفحه آن را ذخیره نمی‌کند.</p>
            <code className="owner-invite-code" dir="ltr">
              {issued.code}
            </code>
          </div>
        )}
        <p
          className={error ? 'owner-otp-status owner-otp-status-error' : 'owner-otp-status'}
          role={error ? 'alert' : 'status'}
          aria-live="polite"
        >
          {error}
        </p>
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

function isIssuedInvite(value: unknown): value is IssuedInvite {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === 'string' && typeof record.expiresAt === 'string';
}
