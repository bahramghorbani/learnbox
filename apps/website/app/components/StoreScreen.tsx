'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Bobo } from './Bobo';
import { LearnerNav, type LearnerDestination } from './LearnerNav';
import { toPersianDigits } from '../persian-digits';

/**
 * Learner Store (Phase 2 / M2.3).
 *
 * Reads the canonical M2.2 endpoints and nothing else: `/api/store/packs` is the catalogue (packs
 * that are BOTH published and listed) and `/api/store/my-packs` is what the learner may actually
 * access. Neither returns card content, so nothing protected can reach this screen.
 *
 * Ownership shown here is the server's `owned` flag, derived from the same rule the content guards
 * use — the screen never decides for itself who owns what. The activate button is a request, not a
 * grant: `POST /api/store/activate` re-checks every condition server-side.
 *
 * Replaces an earlier prototype that fetched sample card words into a detail view (protected
 * content), filtered by invented category labels, and advertised a non-existent subscription.
 */

/** Mirrors `StoreCataloguePack` in lib/store-catalogue.ts. Commercial presentation only. */
type CataloguePack = {
  id: string;
  name: string;
  isFree: boolean;
  priceTomans: number | null;
  featured: boolean;
  commercialSummary: string | null;
  totalCards: number;
  owned: boolean;
};

/** Mirrors `LearnerPack` in lib/store-catalogue.ts. */
type OwnedPack = {
  id: string;
  name: string;
  totalCards: number;
};

type LoadState = 'loading' | 'ready' | 'error';

/** Which pack is mid-activation, and how the last attempt ended. */
type ActivationState = {
  packId: string | null;
  error: string | null;
  success: string | null;
};

const ACTIVATION_IDLE: ActivationState = { packId: null, error: null, success: null };

function formatPrice(pack: CataloguePack): string {
  if (pack.isFree) return 'رایگان';
  if (typeof pack.priceTomans === 'number' && pack.priceTomans > 0) {
    // Group thousands, then switch to the Persian separator and numerals.
    return `${toPersianDigits(pack.priceTomans.toLocaleString('en-US')).replaceAll(',', '٬')} تومان`;
  }
  // A paid pack with no price set is shown as not-yet-available rather than invented as free.
  return 'به‌زودی';
}

export function StoreScreen({
  onNavigate,
  focusPackId = null,
}: {
  onNavigate: (dest: LearnerDestination) => void;
  /**
   * M4.3 slide destination: a pack the learner asked to see from a slider slide.
   *
   * The learner app has no pack detail route, so the smallest safe navigation is the Store itself
   * with that pack brought into view. It changes nothing about WHAT the Store shows: the catalogue
   * is still exactly `/api/store/packs` (published AND listed) and ownership is still
   * `/api/store/my-packs`, so a slide can never surface a pack the learner may not see or buy. A
   * pack that is not in the catalogue is simply not highlighted.
   */
  focusPackId?: string | null;
}) {
  const [catalogue, setCatalogue] = useState<CataloguePack[]>([]);
  const [owned, setOwned] = useState<OwnedPack[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [activation, setActivation] = useState<ActivationState>(ACTIVATION_IDLE);
  const focusedCardRef = useRef<HTMLLIElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState('loading');
    try {
      const [catalogueResponse, ownedResponse] = await Promise.all([
        fetch('/api/store/packs', { credentials: 'same-origin' }),
        fetch('/api/store/my-packs', { credentials: 'same-origin' }),
      ]);
      if (!catalogueResponse.ok || !ownedResponse.ok) {
        // A failed load is reported, never silently rendered as an empty shop.
        setState('error');
        return;
      }
      const catalogueBody = (await catalogueResponse.json()) as { packs?: CataloguePack[] };
      const ownedBody = (await ownedResponse.json()) as { packs?: OwnedPack[] };
      setCatalogue(catalogueBody.packs ?? []);
      setOwned(ownedBody.packs ?? []);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Bring the requested pack into view once the real catalogue has arrived. Guarded because
  // `scrollIntoView` does not exist in the test environment, and absent entirely when the pack is
  // not on offer — no error, no placeholder, nothing that implies a hidden pack exists.
  const focusedPackPresent =
    focusPackId !== null && catalogue.some((pack) => pack.id === focusPackId);
  useEffect(() => {
    if (state !== 'ready' || !focusedPackPresent) return;
    const card = focusedCardRef.current;
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [state, focusedPackPresent, focusPackId]);

  const activate = async (packId: string): Promise<void> => {
    setActivation({ packId, error: null, success: null });
    try {
      const response = await fetch('/api/store/activate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      if (!response.ok) {
        setActivation({
          packId: null,
          success: null,
          error:
            response.status === 401
              ? 'برای دریافت بسته باید وارد حساب خود شوید.'
              : 'دریافت بسته انجام نشد. دوباره تلاش کنید.',
        });
        return;
      }
      const body = (await response.json()) as { status?: string };
      setActivation({
        packId: null,
        error: null,
        success:
          body.status === 'already_owned'
            ? 'این بسته از قبل در بسته‌های شماست.'
            : 'بسته به بسته‌های شما اضافه شد.',
      });
      // Re-read from the server so ownership shown here stays the server's answer rather than an
      // optimistic guess — the same reason the button never flips ownership on its own.
      await load();
    } catch {
      setActivation({
        packId: null,
        success: null,
        error: 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.',
      });
    }
  };

  const purchase = async (packId: string): Promise<void> => {
    setActivation({ packId, error: null, success: null });
    try {
      const response = await fetch('/api/store/purchase/initiate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      if (!response.ok) {
        setActivation({
          packId: null,
          success: null,
          error:
            response.status === 401
              ? 'برای خرید بسته باید وارد حساب خود شوید.'
              : response.status === 502 || response.status === 503
                ? 'درگاه پرداخت در دسترس نیست. کمی بعد دوباره تلاش کنید.'
                : 'شروع خرید انجام نشد. دوباره تلاش کنید.',
        });
        return;
      }
      const body = (await response.json()) as { redirectUrl?: string };
      // The gateway URL is built server-side from the Authority the provider issued; the client
      // only follows it. Nothing here decides the amount or what is being bought.
      if (!body.redirectUrl) {
        setActivation({
          packId: null,
          success: null,
          error: 'شروع خرید انجام نشد. دوباره تلاش کنید.',
        });
        return;
      }
      window.location.assign(body.redirectUrl);
    } catch {
      setActivation({
        packId: null,
        success: null,
        error: 'ارتباط با درگاه پرداخت برقرار نشد. دوباره تلاش کنید.',
      });
    }
  };

  return (
    <main className="store-v2" data-testid="learnbox-store">
      {/* Shared screen chrome, same as Progress — the Store is a native section, not a web shop. */}
      <div className="screen-topbar">
        <div className="topbar-title">
          <div className="topbar-title-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              width="24"
              height="24"
              fill="currentColor"
            >
              <path d="M32,120H224v72a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8Z" opacity="0.2" />
              <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM176,88a48,48,0,0,1-96,0,8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0Z" />
            </svg>
          </div>
          فروشگاه
        </div>
      </div>

      <div className="screen-body-scroll">
        <div className="store-content">
          {activation.success && (
            <p className="store-banner store-banner-success" role="status">
              {activation.success}
            </p>
          )}
          {activation.error && (
            <p className="store-banner store-banner-error" role="alert">
              {activation.error}
            </p>
          )}

          {state === 'loading' && (
            <div className="store-state" role="status">
              <span className="store-spinner" aria-hidden="true" />
              <p>در حال بارگذاری فروشگاه…</p>
            </div>
          )}

          {state === 'error' && (
            <div className="store-state" role="alert">
              <p>فروشگاه در دسترس نیست.</p>
              <button type="button" className="store-retry" onClick={() => void load()}>
                تلاش دوباره
              </button>
            </div>
          )}

          {state === 'ready' && (
            <>
              {owned.length > 0 && (
                <section className="store-section" aria-labelledby="store-my-packs">
                  <h2 id="store-my-packs">بسته‌های من</h2>
                  <ul className="store-owned-list">
                    {owned.map((pack) => (
                      <li key={pack.id} className="store-owned-item">
                        <span className="store-owned-name">{pack.name}</span>
                        <span className="store-owned-meta">
                          {toPersianDigits(pack.totalCards)} کارت
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="store-continue"
                    onClick={() => onNavigate('today')}
                  >
                    ادامه یادگیری
                  </button>
                </section>
              )}

              <section className="store-section" aria-labelledby="store-catalogue">
                <h2 id="store-catalogue">بسته‌های موجود</h2>
                {catalogue.length === 0 ? (
                  <div className="store-empty">
                    <Bobo expression="encourage" size={96} />
                    <p>هنوز بسته‌ای برای عرضه آماده نیست.</p>
                    <p className="store-empty-hint">به‌زودی بسته‌های تازه اینجا اضافه می‌شوند.</p>
                  </div>
                ) : (
                  <ul className="store-pack-list">
                    {catalogue.map((pack) => {
                      const busy = activation.packId === pack.id;
                      return (
                        <li
                          key={pack.id}
                          ref={focusPackId === pack.id ? focusedCardRef : undefined}
                          className={`store-pack-card${pack.owned ? ' owned' : ''}${
                            pack.featured ? ' featured' : ''
                          }${focusPackId === pack.id ? ' slide-focused' : ''}`}
                          aria-current={focusPackId === pack.id ? 'true' : undefined}
                        >
                          <div className="store-pack-head">
                            <h3>{pack.name}</h3>
                            {pack.owned ? (
                              <span className="store-tag store-tag-owned">دریافت‌شده</span>
                            ) : pack.isFree ? (
                              <span className="store-tag store-tag-free">رایگان</span>
                            ) : (
                              <span className="store-tag store-tag-paid">پولی</span>
                            )}
                          </div>

                          {pack.commercialSummary && (
                            <p className="store-pack-summary">{pack.commercialSummary}</p>
                          )}

                          <div className="store-pack-meta">
                            <span>{toPersianDigits(pack.totalCards)} کارت</span>
                            <span className={pack.isFree ? 'store-price free' : 'store-price'}>
                              {formatPrice(pack)}
                            </span>
                          </div>

                          {pack.owned ? (
                            <button
                              type="button"
                              className="store-action store-action-owned"
                              onClick={() => onNavigate('today')}
                            >
                              شروع یادگیری
                            </button>
                          ) : pack.isFree ? (
                            <button
                              type="button"
                              className="store-action store-action-free"
                              onClick={() => void activate(pack.id)}
                              disabled={busy}
                            >
                              {busy ? 'در حال دریافت…' : 'دریافت رایگان'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="store-action"
                              onClick={() => void purchase(pack.id)}
                              disabled={busy}
                            >
                              {busy ? 'در حال انتقال به درگاه…' : 'خرید بسته'}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <LearnerNav current="store" onNavigate={onNavigate} />
    </main>
  );
}
