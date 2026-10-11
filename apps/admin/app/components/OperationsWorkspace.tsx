'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { faDateTime } from './fa-dates';
import { faNum } from './fa-digits';

type GatewayConfiguration = {
  state: 'disabled' | 'unproven' | 'ready';
  provider: string;
  environment: 'sandbox' | 'production' | null;
  verifiedCount: number;
  pendingCount: number;
  failedCount: number;
  lastVerifiedAt: string | null;
};

type PaymentStatus =
  | { kind: 'loading' }
  | { kind: 'available'; configuration: GatewayConfiguration }
  | { kind: 'unavailable' }
  | { kind: 'expired' }
  | { kind: 'error' };

const paymentLabels: Record<GatewayConfiguration['state'], string> = {
  disabled: 'پیکربندی نشده',
  unproven: 'پیکربندی‌شده، اما تأییدنشده',
  ready: 'تأییدشده',
};

const paymentTone: Record<GatewayConfiguration['state'], string> = {
  disabled: 'badge',
  unproven: 'badge b-amber',
  ready: 'badge b-green',
};

function formatDate(value: string | null) {
  return faDateTime(value);
}

/**
 * PDR-009's Operations reference contains sample uptime, queue, storage and deployment data. The
 * Admin has no authorised health or operations read model for those values, so this workspace
 * renders them as unknown rather than probing infrastructure or copying prototype data. The one
 * operational configuration contract that exists is the read-only payment status endpoint; it
 * never returns a credential and has no mutation method.
 */
export function OperationsWorkspace() {
  const [payment, setPayment] = useState<PaymentStatus>({ kind: 'loading' });
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setPayment({ kind: 'loading' });
    try {
      const response = await fetch('/api/store/payment-config', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) return setPayment({ kind: 'expired' });
      if (response.status === 404) return setPayment({ kind: 'unavailable' });
      if (!response.ok) return setPayment({ kind: 'error' });
      const body = (await response.json()) as { configuration?: GatewayConfiguration };
      if (!body.configuration) return setPayment({ kind: 'error' });
      return setPayment({ kind: 'available', configuration: body.configuration });
    } catch {
      return setPayment({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  return (
    <main className="admin-shell cp-workspace operations-workspace" id="ops">
      <AdminSidebar current="ops" />
      <section className="admin-workspace" aria-labelledby="operations-title">
        <div className="page-head">
          <div>
            <h2 id="operations-title">عملیات</h2>
            <p className="muted">شواهد عملیاتیِ مجاز و وضعیت پیکربندی‌های فقط‌خواندنی.</p>
          </div>
          <button className="btn" onClick={() => setRefresh((value) => value + 1)} type="button">
            تازه‌سازی وضعیت
          </button>
        </div>

        <div className="operations-grid">
          <article className="card">
            <div className="card-head">
              <span className="card-title">سلامت سرویس‌ها</span>
              <span className="muted-note">مدل سلامت مجاز موجود نیست</span>
            </div>
            <div className="card-body operations-health-list">
              <p className="notice" role="note">
                این پنل endpoint سلامت، uptime، تأخیر، وضعیت صف یا ظرفیت ذخیره‌سازیِ مجاز ندارد؛
                بنابراین وضعیت آن‌ها «نامشخص» است و به‌عنوان سالم یا ناسالم نمایش داده نمی‌شود.
              </p>
              {[
                'وب‌سرویس برنامه',
                'پایگاه داده',
                'ذخیره‌سازی خصوصی رسانه',
                'کارهای پس‌زمینه و صف',
                'اعلان‌ها',
              ].map((name) => (
                <div className="health-row" key={name}>
                  <span className="health-name">
                    <i aria-hidden="true" className="pulse off" />
                    {name}
                  </span>
                  <span className="unavailable">نامشخص — منبع مجاز ندارد</span>
                </div>
              ))}
            </div>
          </article>

          <article className="card" data-operation-payment-state={payment.kind}>
            <div className="card-head">
              <span className="card-title">وضعیت درگاه پرداخت</span>
              <span className="muted-note">منبع: قرارداد فقط‌خواندنی پرداخت</span>
            </div>
            <div className="card-body">
              {payment.kind === 'loading' ? (
                <LoadingState label="در حال خواندن وضعیت درگاه…" />
              ) : null}
              {payment.kind === 'unavailable' ? (
                <EmptyState
                  icon="inbox"
                  title="وضعیت پرداخت در این محیط در دسترس نیست"
                  description="قرارداد پرداخت برای این محیط یا سطح دسترسی فعال نیست؛ هیچ نتیجه‌ای دربارهٔ سلامت درگاه قابل استنتاج نیست."
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
                  title="وضعیت پرداخت دریافت نشد"
                  description="هیچ وضعیت عملیاتی جایگزین یا مقدار ساختگی نمایش داده نشد."
                  action={
                    <button
                      className="btn"
                      onClick={() => setRefresh((value) => value + 1)}
                      type="button"
                    >
                      تلاش دوباره
                    </button>
                  }
                />
              ) : null}
              {payment.kind === 'available' ? (
                <div className="operations-facts">
                  <div className="health-row">
                    <span className="health-name">
                      درگاه{' '}
                      {payment.configuration.provider === 'zarinpal'
                        ? 'زرین‌پال'
                        : payment.configuration.provider}
                    </span>
                    <span className={paymentTone[payment.configuration.state]}>
                      {paymentLabels[payment.configuration.state]}
                    </span>
                  </div>
                  <div className="health-row">
                    <span className="health-name">محیط</span>
                    <span className={payment.configuration.environment ? undefined : 'unavailable'}>
                      {payment.configuration.environment === 'production'
                        ? 'عملیاتی'
                        : payment.configuration.environment === 'sandbox'
                          ? 'آزمایشی'
                          : 'تعیین نشده'}
                    </span>
                  </div>
                  <div className="health-row">
                    <span className="health-name">پرداخت‌های تأییدشده</span>
                    <span>{faNum(payment.configuration.verifiedCount)}</span>
                  </div>
                  <div className="health-row">
                    <span className="health-name">در انتظار / ناموفق</span>
                    <span>
                      {faNum(payment.configuration.pendingCount)} /{' '}
                      {faNum(payment.configuration.failedCount)}
                    </span>
                  </div>
                  <div className="health-row">
                    <span className="health-name">آخرین پرداخت تأییدشده</span>
                    <span
                      className={payment.configuration.lastVerifiedAt ? undefined : 'unavailable'}
                    >
                      {formatDate(payment.configuration.lastVerifiedAt)}
                    </span>
                  </div>
                  <p className="muted-note">
                    شناسهٔ پذیرنده و هیچ secret دیگری در این صفحه خوانده، نمایش یا ویرایش نمی‌شود.
                  </p>
                </div>
              ) : null}
            </div>
          </article>
        </div>

        <div className="operations-grid">
          <article className="card">
            <div className="card-head">
              <span className="card-title">گزارش اقدامات مدیریتی</span>
            </div>
            <div className="card-body">
              <p className="muted-note">
                مسیر موجود گزارش حسابرسی، تنها منبع معتبر برای اقدامات ثبت‌شده است. این گزارش
                append-only و فقط‌خواندنی باقی می‌ماند.
              </p>
              <a className="btn" href="#audit">
                مشاهدهٔ گزارش اقدامات
              </a>
            </div>
          </article>
          <article className="card">
            <div className="card-head">
              <span className="card-title">اقدامات نگه‌داری</span>
            </div>
            <div className="card-body">
              <EmptyState
                icon="shield"
                title="هیچ فرمان عملیاتی مجاز نیست"
                description="پشتیبان‌گیری، پاک‌سازی cache، دریافت log، استقرار و فعال‌سازی integration از Admin endpoint تأییدشده ندارند."
              />
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
