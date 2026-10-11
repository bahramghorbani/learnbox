'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';

type SessionState =
  | { kind: 'loading' }
  | { kind: 'active'; recent: boolean }
  | { kind: 'expired' }
  | { kind: 'unavailable' }
  | { kind: 'error' };

type PaymentConfiguration = {
  state: 'disabled' | 'unproven' | 'ready';
  environment: 'sandbox' | 'production' | null;
};

type PaymentState =
  | { kind: 'loading' }
  | { kind: 'available'; configuration: PaymentConfiguration }
  | { kind: 'unavailable' }
  | { kind: 'expired' }
  | { kind: 'error' };

const paymentLabel: Record<PaymentConfiguration['state'], string> = {
  disabled: 'پیکربندی نشده',
  unproven: 'پیکربندی‌شده، اما اثبات‌نشده',
  ready: 'تأییدشده',
};

/**
 * The frozen Settings design contains editable environment switches and personal profile data that
 * no current Admin contract exposes. This page makes the actual boundary visible: it reads only the
 * current-session and payment-configuration contracts, and has no writable inputs, secret values,
 * environment values, or feature-toggle request.
 */
export function SettingsWorkspace() {
  const [session, setSession] = useState<SessionState>({ kind: 'loading' });
  const [payment, setPayment] = useState<PaymentState>({ kind: 'loading' });
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setSession({ kind: 'loading' });
    setPayment({ kind: 'loading' });
    try {
      const [sessionResponse, paymentResponse] = await Promise.all([
        fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/store/payment-config', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      if (sessionResponse.status === 401) setSession({ kind: 'expired' });
      else if (sessionResponse.status === 404) setSession({ kind: 'unavailable' });
      else if (!sessionResponse.ok) setSession({ kind: 'error' });
      else {
        const body = (await sessionResponse.json()) as {
          authenticated?: unknown;
          recent?: unknown;
        };
        setSession(
          body.authenticated === true
            ? { kind: 'active', recent: body.recent === true }
            : { kind: 'error' },
        );
      }

      if (paymentResponse.status === 401) setPayment({ kind: 'expired' });
      else if (paymentResponse.status === 404) setPayment({ kind: 'unavailable' });
      else if (!paymentResponse.ok) setPayment({ kind: 'error' });
      else {
        const body = (await paymentResponse.json()) as { configuration?: PaymentConfiguration };
        setPayment(
          body.configuration
            ? { kind: 'available', configuration: body.configuration }
            : { kind: 'error' },
        );
      }
    } catch {
      setSession({ kind: 'error' });
      setPayment({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  return (
    <main className="admin-shell cp-workspace settings-workspace" id="settings">
      <AdminSidebar current="settings" />
      <section className="admin-workspace" aria-labelledby="settings-title">
        <div className="page-head">
          <div>
            <h2 id="settings-title">تنظیمات</h2>
            <p className="muted">
              وضعیت پیکربندی‌های مجاز برای مشاهده؛ هیچ تغییر محیطی از این صفحه انجام نمی‌شود.
            </p>
          </div>
          <button className="btn" onClick={() => setRefresh((value) => value + 1)} type="button">
            تازه‌سازی وضعیت
          </button>
        </div>

        <div className="settings-grid">
          <article className="card" data-settings-session={session.kind}>
            <div className="card-head">
              <span className="card-title">دسترسی مدیر</span>
            </div>
            <div className="card-body">
              {session.kind === 'loading' ? <LoadingState label="در حال بررسی نشست…" /> : null}
              {session.kind === 'active' ? (
                <dl className="settings-facts">
                  <div>
                    <dt>روش ورود</dt>
                    <dd>Passkey</dd>
                  </div>
                  <div>
                    <dt>احراز هویت حساس</dt>
                    <dd>
                      {session.recent ? 'معتبر است' : 'برای عملیات حساس دوباره درخواست می‌شود'}
                    </dd>
                  </div>
                  <div>
                    <dt>مدیریت کلیدهای عبور</dt>
                    <dd>
                      <a href="#access">نشست‌ها و دسترسی</a>
                    </dd>
                  </div>
                </dl>
              ) : null}
              {session.kind === 'expired' ? (
                <ErrorState
                  tone="amber"
                  title="نشست منقضی شده است"
                  description="برای مشاهدهٔ وضعیت دسترسی، دوباره وارد شوید."
                />
              ) : null}
              {session.kind === 'unavailable' ? (
                <EmptyState
                  icon="shield"
                  title="قرارداد نشست در این محیط فعال نیست"
                  description="هیچ نقش، دستگاه یا نشست ساختگی نمایش داده نمی‌شود."
                />
              ) : null}
              {session.kind === 'error' ? (
                <ErrorState
                  title="وضعیت نشست دریافت نشد"
                  description="پیکربندی دسترسی تغییر نکرده است."
                />
              ) : null}
            </div>
          </article>

          <article className="card" data-settings-payment={payment.kind}>
            <div className="card-head">
              <span className="card-title">پیکربندی پرداخت</span>
            </div>
            <div className="card-body">
              {payment.kind === 'loading' ? (
                <LoadingState label="در حال خواندن وضعیت پیکربندی پرداخت…" />
              ) : null}
              {payment.kind === 'available' ? (
                <dl className="settings-facts">
                  <div>
                    <dt>وضعیت درگاه</dt>
                    <dd>{paymentLabel[payment.configuration.state]}</dd>
                  </div>
                  <div>
                    <dt>محیط</dt>
                    <dd>
                      {payment.configuration.environment === 'production'
                        ? 'عملیاتی'
                        : payment.configuration.environment === 'sandbox'
                          ? 'آزمایشی'
                          : 'تعیین نشده'}
                    </dd>
                  </div>
                  <div>
                    <dt>تغییر پیکربندی</dt>
                    <dd>از پنل Admin پشتیبانی نمی‌شود</dd>
                  </div>
                </dl>
              ) : null}
              {payment.kind === 'unavailable' ? (
                <EmptyState
                  icon="inbox"
                  title="وضعیت پرداخت در دسترس نیست"
                  description="این نتیجه به معنی سالم یا ناسالم بودن درگاه نیست."
                />
              ) : null}
              {payment.kind === 'expired' ? (
                <ErrorState
                  tone="amber"
                  title="نشست منقضی شده است"
                  description="برای خواندن وضعیت فقط‌خواندنی پرداخت، دوباره وارد شوید."
                />
              ) : null}
              {payment.kind === 'error' ? (
                <ErrorState
                  title="وضعیت پیکربندی پرداخت دریافت نشد"
                  description="هیچ مقدار جایگزین یا credentialی نمایش داده نمی‌شود."
                />
              ) : null}
            </div>
          </article>
        </div>

        <article className="card settings-boundary-card">
          <div className="card-head">
            <span className="card-title">مرز پیکربندی محیط</span>
          </div>
          <div className="card-body">
            <div className="settings-unavailable-grid">
              {[
                [
                  'قابلیت‌های محتوا و انتشار',
                  'وضعیت قابل‌نمایشِ مجاز برای پرچم‌های محیطی موجود نیست.',
                ],
                ['اعلان‌ها، ایمیل و پیامک', 'endpoint پیکربندی یا وضعیت عملیاتیِ مجاز وجود ندارد.'],
                ['ذخیره‌سازی و رسانه', 'مسیر عملیاتی و status read model تأییدشده موجود نیست.'],
                [
                  'پروفایل مدیر و نقش‌ها',
                  'قرارداد نشست فقط نشست جاری را ارائه می‌کند؛ نام، ایمیل و نقش نمایش داده نمی‌شود.',
                ],
              ].map(([title, description]) => (
                <div className="settings-unavailable" key={title}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <span className="badge">در دسترس نیست</span>
                </div>
              ))}
            </div>
            <p className="notice" role="note">
              کلیدهای محیطی، secretها، credentialها و مقادیر خام پیکربندی هرگز در Admin نمایش داده
              یا ویرایش نمی‌شوند. فعال‌سازی integration یا تغییر زیرساخت خارج از این صفحه و نیازمند
              تأیید مستقل است.
            </p>
          </div>
        </article>
      </section>
    </main>
  );
}
