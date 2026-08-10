'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';

type CurrentSplash = {
  revision: string;
  width: number;
  height: number;
  byteSize: number;
  updatedAt: string;
  previewPath: string;
};

type PanelState =
  | 'idle'
  | 'confirming'
  | 'uploading'
  | 'reauth-required'
  | 'reauthenticating'
  | 'success'
  | 'error';

const acceptedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maximumBytes = 8 * 1024 * 1024;

function readBrowserCookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function localFileError(file: File) {
  if (!acceptedTypes.has(file.type)) return 'فرمت فایل قابل قبول نیست.';
  if (file.size <= 0) return 'فایل انتخاب‌شده خالی است.';
  if (file.size > maximumBytes) return 'حجم فایل بیشتر از ۸ مگابایت است.';
  return undefined;
}

export function SplashReplacementPanel() {
  const [current, setCurrent] = useState<CurrentSplash>();
  const [available, setAvailable] = useState(true);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [state, setState] = useState<PanelState>('idle');
  const [pendingKey, setPendingKey] = useState<string>();
  const confirmButton = useRef<HTMLButtonElement>(null);

  const loadCurrent = useCallback(async () => {
    try {
      const response = await fetch('/api/splash/current', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setAvailable(false);
        return;
      }
      if (!response.ok) throw new Error('current unavailable');
      const payload = (await response.json()) as { current?: CurrentSplash | null };
      setCurrent(payload.current ?? undefined);
      setAvailable(true);
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    if (state === 'confirming') confirmButton.current?.focus();
  }, [state]);

  function chooseFile(nextFile?: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(undefined);
    setFile(undefined);
    setState('idle');
    setFileError(undefined);
    if (!nextFile) return;
    const rejection = localFileError(nextFile);
    if (rejection) {
      setFileError(rejection);
      return;
    }
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  async function sendReplacement(idempotencyKey: string) {
    if (!file) return;
    const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
    if (!csrfToken) {
      setState('error');
      return;
    }
    setState('uploading');
    const form = new FormData();
    form.set('splash', file);
    try {
      const response = await fetch('/api/splash/replace', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-learnbox-csrf-token': csrfToken,
        },
        body: form,
      });
      if (response.status === 428) {
        setPendingKey(idempotencyKey);
        setState('reauth-required');
        return;
      }
      if (!response.ok) throw new Error('replacement unavailable');
      setState('success');
      setPendingKey(undefined);
      await loadCurrent();
    } catch {
      setState('error');
    }
  }

  async function reauthenticate() {
    const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
    if (!csrfToken || !pendingKey) {
      setState('error');
      return;
    }
    setState('reauthenticating');
    try {
      const optionsResponse = await fetch('/api/auth/reauth/options', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!optionsResponse.ok) throw new Error('reauth options unavailable');
      const optionsJSON = await optionsResponse.json();
      const assertion = await startAuthentication({ optionsJSON });
      const verifyResponse = await fetch('/api/auth/reauth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': csrfToken,
        },
        body: JSON.stringify({ response: assertion }),
      });
      if (verifyResponse.status !== 204) throw new Error('reauth failed');
      await sendReplacement(pendingKey);
    } catch {
      setState('error');
    }
  }

  return (
    <section className="splash-panel" id="splash-management" aria-labelledby="splash-title">
      <div className="splash-panel-heading">
        <div>
          <span className="splash-kicker">نمای آغاز برنامه</span>
          <h2 id="splash-title">جایگزینی اسپلش</h2>
          <p>آخرین تصویر تأییدشده تا جایگزینی بعدی نمایش داده می‌شود.</p>
        </div>
        <span className="splash-private-badge">فقط مدیر</span>
      </div>

      <div className="splash-panel-grid">
        <div className="splash-current-card">
          <h3>تصویر فعلی</h3>
          <div className="splash-frame">
            {current ? (
              <img src={current.previewPath} alt="پیش‌نمایش اسپلش فعلی LearnBox" />
            ) : (
              <span>{available ? 'هنوز تصویری ثبت نشده است.' : 'در این محیط فعال نیست.'}</span>
            )}
          </div>
          {current ? (
            <dl className="splash-meta">
              <div>
                <dt>نسخه</dt>
                <dd dir="ltr">{current.revision.slice(0, 8)}</dd>
              </div>
              <div>
                <dt>ابعاد</dt>
                <dd dir="ltr">{current.width} × {current.height}</dd>
              </div>
              <div>
                <dt>آخرین تغییر</dt>
                <dd>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(current.updatedAt))}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="splash-upload-card">
          <h3>تصویر جدید</h3>
          <p className="splash-guidance">
            PNG، JPEG یا WebP · حداکثر ۸ مگابایت · حداقل ۸۶۴ × ۱۶۰۰ پیکسل
          </p>
          <label className="splash-file-control">
            <span>{file ? file.name : 'انتخاب تصویر از دستگاه'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </label>
          {fileError ? <p className="splash-error" role="alert">{fileError}</p> : null}
          {preview ? (
            <div className="splash-local-preview">
              <img src={preview} alt="پیش‌نمایش محلی اسپلش انتخاب‌شده" />
              <span>پیش‌نمایش محلی؛ ابعاد و محتوای واقعی روی سرور بررسی می‌شود.</span>
            </div>
          ) : null}

          {file && state !== 'confirming' && state !== 'uploading' && state !== 'reauthenticating' ? (
            <button className="splash-primary-action" type="button" onClick={() => setState('confirming')}>
              آماده‌سازی جایگزینی
            </button>
          ) : null}

          {state === 'confirming' ? (
            <div className="splash-confirmation" role="group" aria-label="تأیید جایگزینی اسپلش">
              <p>پس از موفقیت، تصویر فعلی با همین تصویر جایگزین می‌شود.</p>
              <div>
                <button type="button" className="splash-secondary-action" onClick={() => setState('idle')}>
                  انصراف
                </button>
                <button
                  ref={confirmButton}
                  type="button"
                  className="splash-primary-action"
                  onClick={() => void sendReplacement(crypto.randomUUID())}
                >
                  تأیید و جایگزینی
                </button>
              </div>
            </div>
          ) : null}

          {state === 'uploading' || state === 'reauthenticating' ? (
            <p className="splash-status" role="status" aria-live="polite">در حال انجام امن جایگزینی…</p>
          ) : null}
          {state === 'reauth-required' ? (
            <div className="splash-reauth" role="status">
              <p>برای این تغییر حساس، هویت مدیر باید دوباره تأیید شود.</p>
              <button type="button" className="splash-primary-action" onClick={() => void reauthenticate()}>
                تأیید دوباره با Passkey
              </button>
            </div>
          ) : null}
          {state === 'success' ? (
            <p className="splash-success" role="status" tabIndex={-1}>اسپلش با موفقیت جایگزین شد.</p>
          ) : null}
          {state === 'error' ? (
            <p className="splash-error" role="alert">جایگزینی انجام نشد. دوباره تلاش کنید.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
