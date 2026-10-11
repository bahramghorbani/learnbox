'use client';

import React, { useEffect, useState } from 'react';

import { useAdminWorkspaceAccess } from './AdminAuthGate';
import { AdminSidebar } from './AdminSidebar';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';

type LearningState =
  | { kind: 'loading' }
  | { kind: 'ready'; activeInWindow: number; windowDays: number }
  | { kind: 'unavailable' }
  | { kind: 'error' };

function fa(value: number) {
  return new Intl.NumberFormat('fa-IR').format(value);
}

/**
 * PDR-009's learning screen may display only a read model Admin already owns. The Dashboard
 * aggregate exposes distinct learners with review events in a reporting window; it does not expose
 * progress, accuracy, retention, scheduler state, difficulty, or a learning-day calculation.
 */
export function LearningWorkspace() {
  const access = useAdminWorkspaceAccess();
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<LearningState>(
    access === 'server-authenticated' ? { kind: 'loading' } : { kind: 'unavailable' },
  );

  useEffect(() => {
    if (access !== 'server-authenticated') {
      setState({ kind: 'unavailable' });
      return;
    }
    let active = true;
    setState({ kind: 'loading' });
    void fetch('/api/dashboard/overview', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 404) return { kind: 'unavailable' } as const;
        if (!response.ok) return { kind: 'error' } as const;
        const body = (await response.json()) as {
          overview?: { windowDays?: unknown; learners?: { activeInWindow?: unknown } };
        };
        const windowDays = body.overview?.windowDays;
        const activeInWindow = body.overview?.learners?.activeInWindow;
        if (
          typeof windowDays !== 'number' ||
          !Number.isInteger(windowDays) ||
          typeof activeInWindow !== 'number' ||
          !Number.isFinite(activeInWindow)
        ) {
          return { kind: 'error' } as const;
        }
        return { kind: 'ready', windowDays, activeInWindow } as const;
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
    <main className="admin-shell cp-workspace learning-workspace" id="learning">
      <AdminSidebar current="learning" />
      <section className="admin-workspace" aria-labelledby="learning-title">
        <div className="page-head">
          <h2 id="learning-title">یادگیری</h2>
          <p className="muted">فقط شاخص‌هایی که مدل خواندنیِ مجاز دارند نمایش داده می‌شوند.</p>
        </div>

        {state.kind === 'loading' ? <LoadingState label="در حال خواندن خلاصهٔ یادگیری…" /> : null}
        {state.kind === 'unavailable' ? (
          <ErrorState
            tone="grey"
            title="دادهٔ یادگیری در این محیط در دسترس نیست"
            description="مدل خواندنیِ داشبورد فعال نیست یا دسترسی لازم برای آن وجود ندارد. این وضعیت به‌معنای صفر بودن داده‌ها نیست."
          />
        ) : null}
        {state.kind === 'error' ? (
          <ErrorState
            title="خلاصهٔ یادگیری دریافت نشد"
            description="هیچ شاخصی نمایش داده نشد. بدون تغییر داده‌ها، دوباره تلاش کنید."
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
        {state.kind === 'ready' ? (
          <>
            <div className="learning-real-grid">
              <article className="card learning-active-card">
                <div className="card-head">
                  <span className="card-title">زبان‌آموزان فعال</span>
                  <span className="badge b-green">دادهٔ واقعی</span>
                </div>
                <div className="card-body">
                  <strong className="learning-metric">{fa(state.activeInWindow)}</strong>
                  <p className="muted-note">
                    دارای دست‌کم یک رویداد مرور در {fa(state.windowDays)} روز اخیر
                  </p>
                </div>
              </article>
              <article className="card learning-source-card">
                <div className="card-head">
                  <span className="card-title">منبع داده</span>
                </div>
                <div className="card-body">
                  <p className="muted-note">
                    این عدد از aggregate مجاز Dashboard می‌آید؛ زمان‌بندی، پیشرفت یا کیفیت یادگیری
                    را تعریف نمی‌کند.
                  </p>
                </div>
              </article>
            </div>

            <div className="learning-unavailable-grid" aria-label="شاخص‌های بدون مدل خواندنی مجاز">
              <UnavailableMetric
                title="دقت و نگه‌داشت"
                description="مدل خواندنیِ مجاز برای این شاخص وجود ندارد."
              />
              <UnavailableMetric
                title="کارت‌های دشوار"
                description="شمارش دشواری یا خطا از قرارداد Admin در دسترس نیست."
              />
              <UnavailableMetric
                title="زمان‌بندی مرور"
                description="وضعیت یا الگوریتم زمان‌بندی خارج از مرز Admin است."
              />
              <UnavailableMetric
                title="توزیع سطح"
                description="پیشرفت یا سطح زبان‌آموزان به Admin ارسال نمی‌شود."
              />
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function UnavailableMetric({ title, description }: { title: string; description: string }) {
  return (
    <article className="card learning-unavailable-card">
      <div className="card-head">
        <span className="card-title">{title}</span>
        <span className="badge b-grey">در دسترس نیست</span>
      </div>
      <div className="card-body">
        <EmptyState icon="inbox" title="بدون دادهٔ قابل‌نمایش" description={description} />
      </div>
    </article>
  );
}
