'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';

/**
 * Phase 1 / Milestone 1.1 — Content & Packs workspace.
 *
 * Visual source of truth: the APPROVED, DESIGN FROZEN Admin prototype
 * (`prototypes/admin-ui-v1/content.html`, PDR-009). Every number rendered here comes from the
 * canonical LearnBox database through `/api/content/packs`; there is no static business data and
 * no fabricated count. Where the canonical schema genuinely cannot answer a field the prototype
 * shows, the UI says so explicitly instead of inventing a value.
 */

type ServerPack = {
  id: string;
  displayName: string;
  description: string | null;
  locale: string;
  targetCefr: string;
  targetItemCount: number;
  category: string | null;
  isFree: boolean;
  priceTomans: number | null;
  status: string;
  cardCount: number;
  publishedCardCount: number;
  reviewableCardCount: number;
  createdAt: string | null;
  publishedAt: string | null;
};

type ServerCardMedia = {
  imageCount: number;
  wordAudioCount: number;
  sentenceAudioCount: number;
  unrecorded: boolean;
};

type ServerCard = {
  cardId: string;
  contentId: string;
  cardVersionId: string;
  lemma: string;
  article: string | null;
  partOfSpeech: string;
  persianMeanings: string[];
  essentialInflection: string | null;
  pronunciationIpa: string | null;
  examples: Array<{ german: string; persian: string }>;
  versionStatus: string;
  sortOrder: number;
  media: ServerCardMedia;
};

type Phase = 'loading' | 'unauthorized' | 'disabled' | 'error' | 'empty' | 'ready';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Persian digit presentation, matching the frozen prototype's `fa()` helper. */
function fa(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => FA_DIGITS[Number(digit)]);
}

function faNum(value: number): string {
  return fa(value.toLocaleString('en-US'));
}

/** Canonical pack status → approved badge treatment, mirroring the prototype's `packBadge()`. */
const PACK_BADGE: Record<string, readonly [string, string]> = {
  draft: ['b-grey', 'پیش‌نویس'],
  ai_generated: ['b-grey', 'ساخته‌شده با هوش مصنوعی'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-amber', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
};

const CARD_BADGE: Record<string, readonly [string, string]> = {
  draft: ['b-grey', 'پیش‌نویس'],
  auto_validated: ['b-amber', 'در انتظار بررسی'],
  needs_review: ['b-amber', 'در انتظار بررسی'],
  approved: ['b-green', 'تأییدشده'],
  published: ['b-green', 'منتشر شده'],
  rejected: ['b-rose', 'ردشده'],
};

function PackBadge({ status }: { status: string }) {
  const [tone, label] = PACK_BADGE[status] ?? ['b-grey', status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

function CardBadge({ status }: { status: string | null }) {
  if (!status) return <span className="badge b-grey">بدون نسخه</span>;
  const [tone, label] = CARD_BADGE[status] ?? ['b-grey', status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

/** Media availability cell. When the canonical `media[]` array is empty the UI shows «—» meaning
 *  "not recorded yet" — it never renders an absent value as a confirmed "no". */
function MediaMark({ count, unrecorded }: { count: number; unrecorded: boolean }) {
  if (unrecorded) {
    return (
      <span className="cp-media-unknown" title="در دادهٔ کانونی ثبت نشده است">
        —
      </span>
    );
  }
  return count > 0 ? (
    <span className="cp-media-yes" aria-label="دارد">
      ✓
    </span>
  ) : (
    <span className="cp-media-no" aria-label="ندارد">
      ✗
    </span>
  );
}

const STATE_TABS = [
  { key: 'all', label: 'همه' },
  { key: 'published', label: 'منتشر شده' },
  { key: 'needs_review', label: 'در انتظار بررسی' },
  { key: 'draft', label: 'پیش‌نویس' },
] as const;

export function ContentPacksWorkspace() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [packs, setPacks] = useState<ServerPack[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [openPackId, setOpenPackId] = useState<string>();
  const [cards, setCards] = useState<ServerCard[]>([]);
  const [cardsPhase, setCardsPhase] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');

  const loadPacks = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await fetch('/api/content/packs', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setPhase('disabled');
        return;
      }
      if (response.status === 401) {
        setPhase('unauthorized');
        return;
      }
      if (!response.ok) throw new Error('packs unavailable');
      const payload = (await response.json()) as { packs?: ServerPack[] };
      const list = Array.isArray(payload.packs) ? payload.packs : [];
      setPacks(list);
      setPhase(list.length === 0 ? 'empty' : 'ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void loadPacks();
  }, [loadPacks]);

  const loadCards = useCallback(async (packId: string) => {
    setCardsPhase('loading');
    setCards([]);
    try {
      const response = await fetch(`/api/content/packs/${encodeURIComponent(packId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('cards unavailable');
      const payload = (await response.json()) as { cards?: ServerCard[] };
      setCards(Array.isArray(payload.cards) ? payload.cards : []);
      setCardsPhase('ready');
    } catch {
      setCardsPhase('error');
    }
  }, []);

  function openPack(packId: string) {
    setOpenPackId(packId);
    void loadCards(packId);
  }

  const visible = packs.filter((pack) => (filter === 'all' ? true : pack.status === filter));
  const tabCount = (key: string) =>
    key === 'all' ? packs.length : packs.filter((pack) => pack.status === key).length;

  // Every KPI below is a real aggregate over canonical rows — never a literal.
  const totalCards = packs.reduce((sum, pack) => sum + pack.cardCount, 0);
  const publishedCards = packs.reduce((sum, pack) => sum + pack.publishedCardCount, 0);
  const reviewableCards = packs.reduce((sum, pack) => sum + pack.reviewableCardCount, 0);
  const publishedPacks = packs.filter((pack) => pack.status === 'published').length;
  const freePacks = packs.filter((pack) => pack.isFree).length;

  const openPackRecord = packs.find((pack) => pack.id === openPackId);
  // Media facts exist per card version, so this is only known once a pack's cards are loaded.
  const loadedMediaRecorded = cards.some((card) => !card.media.unrecorded);

  return (
    <main className="admin-shell cp-workspace" id="content">
      <AdminSidebar current="content" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>محتوا و بسته‌ها</h1>
            <p className="muted">
              بسته‌ها و کارت‌های واقعی LearnBox، خوانده‌شده از پایگاه دادهٔ کانونی.
            </p>
          </div>
        </div>

        {phase === 'disabled' ? (
          <div className="notice" role="status" data-cp-state="disabled">
            <span>
              نمای «محتوا و بسته‌ها» در این محیط غیرفعال است؛ هیچ دادهٔ محتوایی خوانده نمی‌شود.
            </span>
          </div>
        ) : null}

        {phase === 'loading' ? (
          <div className="notice" role="status" aria-live="polite" data-cp-state="loading">
            <span>در حال دریافت بسته‌ها از سرور…</span>
          </div>
        ) : null}

        {phase === 'unauthorized' ? (
          <div className="notice" role="status" data-cp-state="unauthorized">
            <span>نشست امن معتبر نیست؛ برای مشاهدهٔ محتوا دوباره وارد شوید.</span>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="notice rose" role="status" data-cp-state="error">
            <span>دریافت بسته‌ها از سرور ناموفق بود.</span>
            <button className="btn" type="button" onClick={() => void loadPacks()}>
              تلاش دوباره
            </button>
          </div>
        ) : null}

        {phase === 'empty' ? (
          <div className="notice" role="status" data-cp-state="empty">
            <span>هنوز هیچ بستهٔ محتوایی در پایگاه دادهٔ کانونی ثبت نشده است.</span>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <>
            <div className="kpi-row" aria-label="شمارنده‌های محتوا">
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بسته‌ها</span>
                </div>
                <div className="kpi-value" data-cp-kpi="packs">
                  {faNum(packs.length)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بستهٔ منتشرشده</span>
                </div>
                <div className="kpi-value" data-cp-kpi="published-packs">
                  {faNum(publishedPacks)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">کارت‌ها</span>
                </div>
                <div className="kpi-value" data-cp-kpi="cards">
                  {faNum(totalCards)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">کارت منتشرشده</span>
                </div>
                <div className="kpi-value" data-cp-kpi="published-cards">
                  {faNum(publishedCards)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">در انتظار بررسی</span>
                </div>
                <div className="kpi-value" data-cp-kpi="reviewable-cards">
                  {faNum(reviewableCards)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بستهٔ رایگان</span>
                </div>
                <div className="kpi-value" data-cp-kpi="free-packs">
                  {faNum(freePacks)}
                </div>
              </div>
            </div>

            <div className="card mb">
              <div className="tabs" role="tablist" aria-label="وضعیت بسته">
                {STATE_TABS.map((tab) => (
                  <button
                    aria-selected={filter === tab.key}
                    className={filter === tab.key ? 'tab on' : 'tab'}
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    role="tab"
                    type="button"
                  >
                    {tab.label} ({faNum(tabCount(tab.key))})
                  </button>
                ))}
              </div>
              <div className="toolbar">
                <div style={{ flex: 1 }} />
                <button
                  className={view === 'grid' ? 'chip on' : 'chip'}
                  onClick={() => setView('grid')}
                  type="button"
                >
                  کارت
                </button>
                <button
                  className={view === 'list' ? 'chip on' : 'chip'}
                  onClick={() => setView('list')}
                  type="button"
                >
                  جدول
                </button>
              </div>
            </div>

            {view === 'grid' ? (
              <div className="pack-grid" data-cp-view="grid">
                {visible.map((pack) => (
                  <article className="pack-card" key={pack.id}>
                    <div className="pack-body">
                      <div className="pack-name">{pack.displayName}</div>
                      <div className="pack-meta">
                        <span>{faNum(pack.cardCount)} کارت</span>
                        <span className="ltr">{pack.targetCefr}</span>
                        {pack.category ? <span>{pack.category}</span> : null}
                      </div>
                      {pack.description ? <p className="muted">{pack.description}</p> : null}
                      <div className="pack-foot">
                        <PackBadge status={pack.status} />
                        <button className="btn" onClick={() => openPack(pack.id)} type="button">
                          مشاهدهٔ کارت‌ها
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="card" data-cp-view="list">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>نام بسته</th>
                      <th>سطح</th>
                      <th>کارت</th>
                      <th>منتشرشده</th>
                      <th>وضعیت</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((pack) => (
                      <tr key={pack.id}>
                        <td>{pack.displayName}</td>
                        <td className="ltr">{pack.targetCefr}</td>
                        <td>{faNum(pack.cardCount)}</td>
                        <td>{faNum(pack.publishedCardCount)}</td>
                        <td>
                          <PackBadge status={pack.status} />
                        </td>
                        <td>
                          <button className="btn" onClick={() => openPack(pack.id)} type="button">
                            کارت‌ها
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="tbl-foot">
                  <span>{faNum(visible.length)} بسته</span>
                </div>
              </div>
            )}

            {openPackId ? (
              <div className="card" data-cp-cards-panel={openPackId}>
                <div className="card-head">
                  <span className="card-title">
                    کارت‌های بسته: {openPackRecord?.displayName ?? openPackId}
                  </span>
                  <button className="btn" onClick={() => setOpenPackId(undefined)} type="button">
                    بستن
                  </button>
                </div>
                <div className="card-body">
                  {cardsPhase === 'loading' ? (
                    <p className="muted" role="status" aria-live="polite">
                      در حال دریافت کارت‌ها…
                    </p>
                  ) : null}
                  {cardsPhase === 'error' ? (
                    <div className="notice rose" role="status">
                      <span>دریافت کارت‌های این بسته ناموفق بود.</span>
                      <button
                        className="btn"
                        onClick={() => void loadCards(openPackId)}
                        type="button"
                      >
                        تلاش دوباره
                      </button>
                    </div>
                  ) : null}
                  {cardsPhase === 'ready' && cards.length === 0 ? (
                    <p className="muted" role="status">
                      این بسته هیچ کارتی ندارد.
                    </p>
                  ) : null}
                  {cardsPhase === 'ready' && cards.length > 0 ? (
                    <>
                      {!loadedMediaRecorded ? (
                        <div className="notice" role="status" data-cp-state="media-gap">
                          <span>
                            وضعیت تصویر و صدا برای کارت‌های این بسته در دادهٔ کانونی ثبت نشده است
                            («—»). این یک کمبود واقعی داده است و هیچ مقدار جایگزینی ساخته نمی‌شود.
                          </span>
                        </div>
                      ) : null}
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>واژه</th>
                            <th>معنی فارسی</th>
                            <th>تلفظ</th>
                            <th>مثال</th>
                            <th>تصویر</th>
                            <th>صدای واژه</th>
                            <th>صدای جمله</th>
                            <th>وضعیت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cards.map((card) => (
                            <tr key={card.cardId}>
                              <td className="ltr">
                                {card.article ? `${card.article} ` : ''}
                                {card.lemma}
                              </td>
                              <td>{card.persianMeanings.join('، ') || '—'}</td>
                              <td className="ltr mono">{card.pronunciationIpa ?? '—'}</td>
                              <td>{faNum(card.examples.length)}</td>
                              <td>
                                <MediaMark
                                  count={card.media.imageCount}
                                  unrecorded={card.media.unrecorded}
                                />
                              </td>
                              <td>
                                <MediaMark
                                  count={card.media.wordAudioCount}
                                  unrecorded={card.media.unrecorded}
                                />
                              </td>
                              <td>
                                <MediaMark
                                  count={card.media.sentenceAudioCount}
                                  unrecorded={card.media.unrecorded}
                                />
                              </td>
                              <td>
                                <CardBadge status={card.versionStatus} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
