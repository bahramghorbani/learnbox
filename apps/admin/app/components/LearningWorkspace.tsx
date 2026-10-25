'use client';

import React, { useEffect, useState } from 'react';

import { useAdminWorkspaceAccess } from './AdminAuthGate';
import { AdminSidebar } from './AdminSidebar';
import { ErrorState, LoadingState } from './AdminStates';

type LearningState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      activeInWindow: number;
      windowDays: number;
      joinedInWindow: number;
      reviewQueueCards: number;
      packsTotal: number;
      packsPublished: number;
      contentPipeline: { status: string; count: number }[];
    }
  | { kind: 'unavailable' }
  | { kind: 'error' };

function fa(value: number) {
  return new Intl.NumberFormat('fa-IR').format(value);
}

const contentStatusLabels: Record<string, string> = {
  draft: 'پیش‌نویس',
  auto_validated: 'اعتبارسنجی خودکار',
  needs_review: 'نیازمند بازبینی',
  published: 'منتشرشده',
  rejected: 'ردشده',
};

/**
 * PDR-009's learning screen may display only a read model Admin already owns. The Dashboard
 * aggregate exposes distinct learners with review events in a reporting window, pack/content
 * pipeline counters and the review queue depth; it does not expose progress, accuracy, retention,
 * scheduler state, difficulty, or a learning-day calculation — those stay out by owner decision.
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
          overview?: {
            windowDays?: unknown;
            learners?: { activeInWindow?: unknown; joinedInWindow?: unknown };
            reviewQueueCards?: unknown;
            packs?: { total?: unknown; published?: unknown };
            contentPipeline?: { byStatus?: unknown };
          };
        };
        const overview = body.overview;
        const windowDays = overview?.windowDays;
        const activeInWindow = overview?.learners?.activeInWindow;
        const joinedInWindow = overview?.learners?.joinedInWindow;
        const reviewQueueCards = overview?.reviewQueueCards;
        const packsTotal = overview?.packs?.total;
        const packsPublished = overview?.packs?.published;
        const byStatus = overview?.contentPipeline?.byStatus;
        if (
          typeof windowDays !== 'number' ||
          !Number.isInteger(windowDays) ||
          typeof activeInWindow !== 'number' ||
          !Number.isFinite(activeInWindow) ||
          typeof joinedInWindow !== 'number' ||
          !Number.isFinite(joinedInWindow) ||
          typeof reviewQueueCards !== 'number' ||
          !Number.isFinite(reviewQueueCards) ||
          typeof packsTotal !== 'number' ||
          !Number.isFinite(packsTotal) ||
          typeof packsPublished !== 'number' ||
          !Number.isFinite(packsPublished) ||
          !Array.isArray(byStatus) ||
          !byStatus.every(
            (row): row is { status: string; count: number } =>
              typeof row === 'object' &&
              row !== null &&
              typeof (row as { status?: unknown }).status === 'string' &&
              typeof (row as { count?: unknown }).count === 'number',
          )
        ) {
          return { kind: 'error' } as const;
        }
        return {
          kind: 'ready',
          windowDays,
          activeInWindow,
          joinedInWindow,
          reviewQueueCards,
          packsTotal,
          packsPublished,
          contentPipeline: byStatus,
        } as const;
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
              <article className="card">
                <div className="card-head">
                  <span className="card-title">زبان‌آموزان تازه‌وارد</span>
                  <span className="badge b-green">دادهٔ واقعی</span>
                </div>
                <div className="card-body">
                  <strong className="learning-metric">{fa(state.joinedInWindow)}</strong>
                  <p className="muted-note">عضویت جدید در {fa(state.windowDays)} روز اخیر</p>
                </div>
              </article>
              <article className="card">
                <div className="card-head">
                  <span className="card-title">صف بازبینی محتوا</span>
                  <span className="badge b-green">دادهٔ واقعی</span>
                </div>
                <div className="card-body">
                  <strong className="learning-metric">{fa(state.reviewQueueCards)}</strong>
                  <p className="muted-note">کارت‌های منتظر بازبینی یا اعتبارسنجی خودکار</p>
                </div>
              </article>
              <article className="card">
                <div className="card-head">
                  <span className="card-title">نرخ فعال‌سازی محتوا</span>
                  <span className="badge b-green">دادهٔ واقعی</span>
                </div>
                <div className="card-body">
                  <strong className="learning-metric">
                    {state.packsTotal > 0
                      ? `${fa(Math.round((state.packsPublished / state.packsTotal) * 100))}٪`
                      : '—'}
                  </strong>
                  <p className="muted-note">
                    {fa(state.packsPublished)} بستهٔ منتشرشده از {fa(state.packsTotal)} بسته
                  </p>
                </div>
              </article>
              <article className="card learning-source-card">
                <div className="card-head">
                  <span className="card-title">توزیع وضعیت محتوا</span>
                  <span className="badge b-green">دادهٔ واقعی</span>
                </div>
                <div className="card-body">
                  {state.contentPipeline.length === 0 ? (
                    <p className="muted-note">هیچ کارتی ثبت نشده است.</p>
                  ) : (
                    <ul className="learning-pipeline-list">
                      {state.contentPipeline.map((row) => (
                        <li key={row.status}>
                          <span>{contentStatusLabels[row.status] ?? row.status}</span>
                          <strong>{fa(row.count)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
              <article className="card learning-source-card">
                <div className="card-head">
                  <span className="card-title">منبع داده</span>
                </div>
                <div className="card-body">
                  <p className="muted-note">
                    این اعداد از aggregate مجاز Dashboard و قلمروی محتوای خودِ Admin می‌آیند؛
                    زمان‌بندی، پیشرفت یا کیفیت یادگیری را تعریف نمی‌کنند — آن داده‌ها طبق مرز معماری
                    (PDR-009) در اختیار Admin نیست.
                  </p>
                </div>
              </article>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
