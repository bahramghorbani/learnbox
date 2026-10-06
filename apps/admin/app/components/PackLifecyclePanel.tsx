'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Pack lifecycle panel (Phase 1 / Milestone 1.6).
 *
 * This is the operator's single view of where a pack stands and what stops it from reaching
 * learners. It renders only canonical persisted state served by `/api/content/lifecycle`: the
 * pack's lifecycle status, its publish readiness, and — when a release is blocked — the concrete
 * reason per card, named by lemma. A content manager never has to inspect database rows.
 *
 * Every action re-reads the lifecycle afterwards, so what the operator sees is the server's state
 * and not an optimistic guess, and each mutation carries the status the operator acted on so a
 * pack that moved underneath them is refused rather than overwritten.
 */

type PackLifecycleStatus = 'draft' | 'needs_review' | 'approved' | 'published' | 'archived';

type PackBlocker = {
  code: 'pack_not_publishable' | 'pack_empty' | 'pack_incomplete' | 'cards_not_ready';
  expectedItemCount?: number;
  actualItemCount?: number;
};

type CardBlocker = {
  cardVersionId: string;
  contentId: string;
  lemma: string;
  code: 'not_approved' | 'invalid_content' | 'unreviewed_ai_content';
  status: string;
  issues: { field: string; message: string }[];
};

export type PackLifecycleView = {
  packId: string;
  status: PackLifecycleStatus;
  publishedAt: string | null;
  targetItemCount: number;
  cards: { cardVersionId: string; contentId: string; lemma: string; status: string }[];
  submittableCardCount: number;
  readiness: {
    ready: boolean;
    packStatus: PackLifecycleStatus;
    publishableCardCount: number;
    blockers: PackBlocker[];
    cardBlockers: CardBlocker[];
  };
  canSubmitForReview: boolean;
  canPublish: boolean;
  canArchive: boolean;
};

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function faNum(value: number): string {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]!);
}

const STATUS_BADGE: Record<PackLifecycleStatus, readonly [string, string]> = {
  draft: ['b-grey', 'پیش‌نویس'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-amber', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
  archived: ['b-grey', 'بایگانی‌شده'],
};

const CARD_BLOCKER_LABEL: Record<CardBlocker['code'], string> = {
  not_approved: 'بازبینی انسانی کامل نشده است',
  invalid_content: 'فیلدهای کانونی ناقص یا نامعتبر است',
  unreviewed_ai_content: 'محتوای هوش مصنوعی بدون ثبت بازبین انسانی',
};

function packBlockerLabel(blocker: PackBlocker): string {
  switch (blocker.code) {
    case 'pack_not_publishable':
      return 'وضعیت فعلی بسته اجازهٔ انتشار نمی‌دهد.';
    case 'pack_empty':
      return 'این بسته هیچ کارتی ندارد.';
    case 'pack_incomplete':
      return `ترکیب بسته کامل نیست: ${faNum(blocker.actualItemCount ?? 0)} از ${faNum(
        blocker.expectedItemCount ?? 0,
      )} کارت.`;
    case 'cards_not_ready':
      return 'برخی کارت‌ها آمادهٔ انتشار نیستند.';
  }
}

export function PackLifecyclePanel({
  packId,
  manageEnabled,
  onAction,
  onChanged,
}: {
  packId: string;
  manageEnabled: boolean;
  /** Shared mutation path of the workspace: session cookie + CSRF header + idempotency key. */
  onAction: (path: string, body: unknown) => Promise<{ ok: boolean; message?: string }>;
  /** Invoked after a successful lifecycle change so the pack and card tables reload. */
  onChanged: () => void;
}) {
  const [view, setView] = useState<PackLifecycleView>();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'rose'; message: string }>();

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await fetch(`/api/content/lifecycle?packId=${encodeURIComponent(packId)}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setPhase('error');
        return;
      }
      const payload = (await response.json()) as { lifecycle?: PackLifecycleView };
      if (!payload.lifecycle) {
        setPhase('error');
        return;
      }
      setView(payload.lifecycle);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [packId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, successMessage: string) {
    if (!view || busy) return;
    setBusy(true);
    setNotice(undefined);
    // The status the operator acted on travels with the request: a pack that moved in the meantime
    // is refused by the server instead of being overwritten.
    const outcome = await onAction(path, { packId, expectedStatus: view.status });
    if (outcome.ok) {
      setNotice({ tone: 'green', message: successMessage });
      onChanged();
    } else {
      setNotice({
        tone: 'rose',
        message: outcome.message ?? 'این تغییر وضعیت انجام نشد؛ وضعیت به‌روز را ببینید.',
      });
    }
    await load();
    setBusy(false);
  }

  if (phase === 'loading') {
    return (
      <p className="muted" role="status" aria-live="polite">
        در حال دریافت وضعیت چرخهٔ انتشار…
      </p>
    );
  }

  if (phase === 'error' || !view) {
    return (
      <div className="notice rose" role="status" data-cp-state="lifecycle-error">
        <span>دریافت وضعیت چرخهٔ انتشار ناموفق بود.</span>
        <button className="btn" onClick={() => void load()} type="button">
          تلاش دوباره
        </button>
      </div>
    );
  }

  const [tone, label] = STATUS_BADGE[view.status] ?? (['b-grey', view.status] as const);
  const { readiness } = view;

  return (
    <div className="card" data-cp-lifecycle-panel={packId}>
      <div className="card-head">
        <span className="card-title">چرخهٔ بررسی و انتشار</span>
        <span className={`badge ${tone}`} data-cp-lifecycle-status={view.status}>
          {label}
        </span>
        {view.publishedAt ? (
          <span className="muted">
            انتشار: {new Date(view.publishedAt).toLocaleDateString('fa-IR')}
          </span>
        ) : null}
      </div>
      <div className="card-body">
        <p className="muted">
          {faNum(view.cards.length)} کارت
          {view.targetItemCount > 0 ? ` از ${faNum(view.targetItemCount)} کارت هدف` : ''} —{' '}
          {faNum(readiness.publishableCardCount)} کارت آمادهٔ انتشار
          {view.submittableCardCount > 0
            ? ` — ${faNum(view.submittableCardCount)} پیش‌نویس آمادهٔ ارسال به بررسی`
            : ''}
        </p>

        {notice ? (
          <div className={`notice ${notice.tone}`} role="status" aria-live="polite">
            <span>{notice.message}</span>
          </div>
        ) : null}

        {readiness.ready ? (
          <div className="notice green" role="status" data-cp-state="lifecycle-ready">
            <span>همهٔ شرط‌های کانونی انتشار برآورده شده است.</span>
          </div>
        ) : (
          <div className="notice" role="status" data-cp-state="lifecycle-blocked">
            <span>این بسته آمادهٔ انتشار نیست:</span>
            <ul>
              {readiness.blockers
                .filter((blocker) => blocker.code !== 'cards_not_ready')
                .map((blocker) => (
                  <li key={blocker.code}>{packBlockerLabel(blocker)}</li>
                ))}
            </ul>
          </div>
        )}

        {readiness.cardBlockers.length > 0 ? (
          <table className="tbl" data-cp-lifecycle-blockers="cards">
            <thead>
              <tr>
                <th>کارت</th>
                <th>وضعیت</th>
                <th>دلیل</th>
              </tr>
            </thead>
            <tbody>
              {readiness.cardBlockers.map((blocker) => (
                <tr key={blocker.cardVersionId}>
                  <td className="ltr">{blocker.lemma}</td>
                  <td>{blocker.status}</td>
                  <td>
                    {CARD_BLOCKER_LABEL[blocker.code]}
                    {blocker.issues.length > 0 ? (
                      <ul>
                        {blocker.issues.map((issue) => (
                          <li key={`${blocker.cardVersionId}-${issue.field}`}>{issue.message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {manageEnabled ? (
          <div className="row">
            <button
              className="btn"
              type="button"
              disabled={busy || !view.canSubmitForReview}
              onClick={() =>
                void act(
                  '/api/content/lifecycle/submit-review',
                  'کارت‌های پیش‌نویس برای بررسی ارسال شد.',
                )
              }
            >
              ارسال به بررسی
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy || !view.canPublish}
              onClick={() =>
                void act(
                  '/api/content/lifecycle/publish',
                  'بسته منتشر شد و برای زبان‌آموز احراز هویت‌شده قابل دریافت است.',
                )
              }
            >
              انتشار
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || !view.canArchive}
              onClick={() =>
                void act('/api/content/lifecycle/archive', 'بسته بایگانی شد؛ هیچ داده‌ای حذف نشد.')
              }
            >
              بایگانی
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
