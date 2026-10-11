'use client';

import React, { useEffect, useState } from 'react';

import { AddPasskeyButton } from './AddPasskeyButton';
import { useAdminWorkspaceAccess } from './AdminAuthGate';
import { AdminSidebar } from './AdminSidebar';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';

type SessionState =
  | { kind: 'loading' }
  | { kind: 'active'; recent: boolean }
  | { kind: 'expired' }
  | { kind: 'error' }
  | { kind: 'unavailable' };

/**
 * PDR-009's access screen is deliberately limited to facts the current Admin contracts can prove.
 * The existing session API reports only the current session and its recent-auth state; it does not
 * expose a session inventory, device metadata, role assignments, or an audit feed. Those values
 * therefore remain honest unavailable states rather than prototype sample rows.
 */
export function AccessWorkspace() {
  const access = useAdminWorkspaceAccess();
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<SessionState>(
    access === 'server-authenticated' ? { kind: 'loading' } : { kind: 'unavailable' },
  );

  useEffect(() => {
    if (access !== 'server-authenticated') {
      setState({ kind: 'unavailable' });
      return;
    }
    let active = true;
    setState({ kind: 'loading' });
    void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) return { kind: 'expired' } as const;
        if (!response.ok) return { kind: 'error' } as const;
        const body = (await response.json()) as { authenticated?: unknown; recent?: unknown };
        if (body.authenticated !== true) return { kind: 'error' } as const;
        return { kind: 'active', recent: body.recent === true } as const;
      })
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, [access, refresh]);

  return (
    <main className="admin-shell cp-workspace access-workspace" id="access">
      <AdminSidebar current="access" />
      <section className="admin-workspace" aria-labelledby="access-title">
        <div className="page-head">
          <h2 id="access-title">نشست‌ها و دسترسی</h2>
          <p className="muted">وضعیت نشست فعلی و کلیدهای عبور مدیر.</p>
        </div>

        {state.kind === 'loading' ? <LoadingState label="در حال بررسی نشست امن…" /> : null}
        {state.kind === 'unavailable' ? (
          <ErrorState
            tone="grey"
            title="مدیریت دسترسی در این محیط فعال نیست"
            description="این محیط برای Passkey و نشست مدیر پیکربندی نشده است."
          />
        ) : null}
        {state.kind === 'error' ? (
          <ErrorState
            title="وضعیت نشست دریافت نشد"
            description="اطلاعات امنیتی نمایش داده نشد. بدون تغییر دادن داده‌ها، دوباره تلاش کنید."
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
        {state.kind === 'expired' ? (
          <ErrorState
            tone="amber"
            title="نشست منقضی شده است"
            description="برای ادامه، دوباره با Passkey وارد شوید. هیچ تغییر نیمه‌کاره‌ای در این صفحه ذخیره نشده است."
            action={
              <button className="btn" onClick={() => window.location.reload()} type="button">
                ورود دوباره با Passkey
              </button>
            }
          />
        ) : null}
        {state.kind === 'active' ? (
          <>
            <div className="access-summary-grid">
              <article className="card access-session-card">
                <div className="card-head">
                  <span className="card-title">نشست فعلی</span>
                  <span className="badge b-green">فعال</span>
                </div>
                <div className="card-body">
                  <p className="muted-note">
                    {state.recent
                      ? 'احراز هویت مجدد برای عملیات حساس معتبر است.'
                      : 'برای عملیات حساس، Passkey دوباره درخواست می‌شود.'}
                  </p>
                  <dl className="access-facts">
                    <div>
                      <dt>روش ورود</dt>
                      <dd>Passkey</dd>
                    </div>
                    <div>
                      <dt>سیاست نشست</dt>
                      <dd>انقضای بی‌فعالیتی و اعتبار مطلق سمت سرور</dd>
                    </div>
                  </dl>
                </div>
              </article>

              <article className="card access-passkey-card">
                <div className="card-head">
                  <span className="card-title">کلیدهای عبور</span>
                </div>
                <div className="card-body">
                  <AddPasskeyButton />
                </div>
              </article>
            </div>

            <div className="access-honesty-grid">
              <article className="card">
                <div className="card-head">
                  <span className="card-title">نشست‌های فعال</span>
                </div>
                <div className="card-body">
                  <EmptyState
                    icon="shield"
                    title="فهرست نشست‌ها در دسترس نیست"
                    description="API فعلی فقط وضعیت همین نشست را برمی‌گرداند؛ دستگاه یا نشانی شبکه‌ای نمایش داده نمی‌شود."
                  />
                </div>
              </article>
              <article className="card">
                <div className="card-head">
                  <span className="card-title">نقش‌ها و رویدادهای امنیتی</span>
                </div>
                <div className="card-body">
                  <EmptyState
                    icon="inbox"
                    title="داده‌ای برای نمایش وجود ندارد"
                    description="قرارداد فعلی نقش‌ها یا رویدادهای امنیتی را به این workspace نمی‌فرستد."
                  />
                </div>
              </article>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
