'use client';

import '../store-pack-cover.css';

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
  targetCefr: string;
  coverObjectKey: string | null;
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

type NativePurchaseResult = {
  status?: unknown;
  channel?: unknown;
  sku?: unknown;
  purchaseToken?: unknown;
};

type AndroidPurchaseBridge = {
  requestPurchase: (sku: string) => string;
  /** Added with the Bazaar flavor; Myket APKs shipped before it lack this method. */
  getStoreChannel?: () => string;
};

/** Which store this Android build bills through — decides the server route and the copy. */
function nativeStore(bridge: AndroidPurchaseBridge): {
  slug: string;
  channel: string;
  name: string;
} {
  const channel = bridge.getStoreChannel?.();
  if (channel === 'ios_sibapp') return { slug: 'sibapp', channel, name: 'سیب‌اپ' };
  return channel === 'android_bazaar'
    ? { slug: 'bazaar', channel: 'android_bazaar', name: 'کافه‌بازار' }
    : { slug: 'myket', channel: 'android_myket', name: 'مایکت' };
}

function androidPurchaseBridge(): AndroidPurchaseBridge | null {
  const bridge = (window as Window & { LearnBoxNative?: AndroidPurchaseBridge }).LearnBoxNative;
  return typeof bridge?.requestPurchase === 'function' ? bridge : null;
}

function formatPrice(pack: CataloguePack): string {
  if (pack.isFree) return 'رایگان';
  if (typeof pack.priceTomans === 'number' && pack.priceTomans > 0) {
    // Group thousands, then switch to the Persian separator and numerals.
    return `${toPersianDigits(pack.priceTomans.toLocaleString('en-US')).replaceAll(',', '٬')} تومان`;
  }
  // A paid pack with no price set is shown as not-yet-available rather than invented as free.
  return 'به‌زودی';
}

/** «خریدهای من» — the learner's own payment attempts (GET /api/store/purchases). */
type LearnerPurchase = {
  purchaseId: string;
  packId: string;
  packName: string | null;
  amountTomans: number;
  status: string;
  referenceId: string | null;
  orderCode: string | null;
  createdAt: string;
  verifiedAt: string | null;
};

// `cancelled` is not final (a late gateway confirmation still settles it), so it is not called
// a failure; only `failed` is, and only the gateway's own "not paid" answer produces it.
const purchaseStatusLabels: Record<string, string> = {
  verified: 'پرداخت موفق',
  pending: 'در حال بررسی',
  cancelled: 'بازگشت از درگاه بدون تأیید',
  failed: 'ناموفق — مبلغی کسر نشده است',
};

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
  const [level, setLevel] = useState<string | null>(null);
  const [owned, setOwned] = useState<OwnedPack[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [activation, setActivation] = useState<ActivationState>(ACTIVATION_IDLE);
  const focusedCardRef = useRef<HTMLLIElement | null>(null);
  const [purchases, setPurchases] = useState<LearnerPurchase[] | 'error'>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const nativeSkuRef = useRef<{ sku: string; store: ReturnType<typeof nativeStore> } | null>(null);
  /** Outcome of the last re-check, announced next to that purchase. */
  const [checkNote, setCheckNote] = useState<{ purchaseId: string; text: string } | null>(null);

  const loadPurchases = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/store/purchases', { credentials: 'same-origin' });
      // 503 = learner state off in this environment: nothing to show, not an error.
      if (response.status === 503) return setPurchases([]);
      if (!response.ok) return setPurchases('error');
      setPurchases(((await response.json()) as { purchases?: LearnerPurchase[] }).purchases ?? []);
    } catch {
      setPurchases('error');
    }
  }, []);

  /** Asks the server to re-check one unsettled payment with the gateway (throttled server-side). */
  const recheck = useCallback(
    async (purchaseId: string): Promise<void> => {
      if (checking) return;
      setChecking(purchaseId);
      setCheckNote(null);
      let text = 'بررسی ممکن نشد؛ کمی بعد دوباره تلاش کنید.';
      try {
        const response = await fetch(
          `/api/store/purchase/status?id=${encodeURIComponent(purchaseId)}`,
          { credentials: 'same-origin' },
        );
        if (response.ok) {
          const status = ((await response.json()) as { purchase?: { status?: string } }).purchase
            ?.status;
          text =
            status === 'pending'
              ? 'هنوز نتیجه‌ای از درگاه نرسیده؛ بررسی خودکار ادامه دارد.'
              : `وضعیت: ${purchaseStatusLabels[status ?? ''] ?? status ?? '—'}`;
        }
      } catch {
        /* keep the failure text; the reloaded list shows the truth either way */
      }
      await loadPurchases();
      setChecking(null);
      const name =
        purchases === 'error'
          ? undefined
          : purchases.find((p) => p.purchaseId === purchaseId)?.packName;
      setCheckNote({ purchaseId, text: name ? `${name}: ${text}` : text });
    },
    [checking, loadPurchases, purchases],
  );

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
      void loadPurchases();
    } catch {
      setState('error');
    }
  }, [loadPurchases]);

  const verifyNativePurchase = useCallback(
    async (rawResult: string): Promise<void> => {
      let result: NativePurchaseResult;
      try {
        result = JSON.parse(rawResult) as NativePurchaseResult;
      } catch {
        setActivation({
          packId: null,
          success: null,
          error: 'نتیجهٔ خرید خوانده نشد. دوباره تلاش کنید.',
        });
        return;
      }
      const pending = nativeSkuRef.current;
      nativeSkuRef.current = null;
      const sku = pending?.sku;
      if (
        !pending ||
        result.status !== 'succeeded' ||
        result.channel !== pending.store.channel ||
        typeof result.purchaseToken !== 'string' ||
        !result.purchaseToken ||
        result.sku !== sku
      ) {
        setActivation({
          packId: null,
          success: null,
          error: `خرید در ${pending?.store.name ?? 'فروشگاه'} تأیید نشد. دوباره تلاش کنید.`,
        });
        return;
      }
      try {
        const response = await fetch(`/api/store/purchase/${pending.store.slug}/verify`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sku, purchaseToken: result.purchaseToken }),
        });
        if (!response.ok) {
          setActivation({
            packId: null,
            success: null,
            error: 'تأیید خرید انجام نشد. اگر مبلغ کسر شده است با پشتیبانی تماس بگیرید.',
          });
          return;
        }
        const body = (await response.json()) as { status?: string };
        if (body.status !== 'verified' && body.status !== 'already_processed') {
          setActivation({
            packId: null,
            success: null,
            error: 'تأیید خرید انجام نشد. اگر مبلغ کسر شده است با پشتیبانی تماس بگیرید.',
          });
          return;
        }
        setActivation({
          packId: null,
          error: null,
          success: 'خرید با موفقیت تأیید شد و بسته به حساب شما اضافه شد.',
        });
        await load();
      } catch {
        setActivation({
          packId: null,
          success: null,
          error: 'ارتباط با سرور برقرار نشد. اگر مبلغ کسر شده است با پشتیبانی تماس بگیرید.',
        });
      }
    },
    [load],
  );

  useEffect(() => {
    const callbacks = window as Window & {
      LearnBoxNativeCallbacks?: { onPurchaseResult?: (result: string) => void };
    };
    const onPurchaseResult = (result: string) => void verifyNativePurchase(result);
    callbacks.LearnBoxNativeCallbacks = {
      ...callbacks.LearnBoxNativeCallbacks,
      onPurchaseResult,
    };
    return () => {
      if (callbacks.LearnBoxNativeCallbacks?.onPurchaseResult === onPurchaseResult) {
        delete callbacks.LearnBoxNativeCallbacks.onPurchaseResult;
      }
    };
  }, [verifyNativePurchase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Bring the requested pack into view once the real catalogue has arrived. Guarded because
  // `scrollIntoView` does not exist in the test environment, and absent entirely when the pack is
  // not on offer — no error, no placeholder, nothing that implies a hidden pack exists.
  const levels = [...new Set(catalogue.map((pack) => pack.targetCefr).filter(Boolean))].sort();
  const visibleCatalogue = level
    ? catalogue.filter((pack) => pack.targetCefr === level)
    : catalogue;
  const focusedPackPresent =
    focusPackId !== null && visibleCatalogue.some((pack) => pack.id === focusPackId);
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
    const bridge = androidPurchaseBridge();
    const store = bridge ? nativeStore(bridge) : null;
    const endpoint = store
      ? `/api/store/purchase/${store.slug}/initiate`
      : '/api/store/purchase/initiate';
    try {
      const response = await fetch(endpoint, {
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
      const body = (await response.json()) as { redirectUrl?: string; sku?: string };
      if (bridge && store) {
        if (!body.sku) {
          setActivation({
            packId: null,
            success: null,
            error: 'شروع خرید انجام نشد. دوباره تلاش کنید.',
          });
          return;
        }
        nativeSkuRef.current = { sku: body.sku, store };
        const result = JSON.parse(bridge.requestPurchase(body.sku)) as { status?: string };
        if (result.status !== 'pending') {
          nativeSkuRef.current = null;
          setActivation({
            packId: null,
            success: null,
            error: `${store.name} برای خرید در دسترس نیست. دوباره تلاش کنید.`,
          });
        }
        return;
      }
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
      nativeSkuRef.current = null;
      setActivation({
        packId: null,
        success: null,
        error: store
          ? `ارتباط با ${store.name} برقرار نشد. دوباره تلاش کنید.`
          : 'ارتباط با درگاه پرداخت برقرار نشد. دوباره تلاش کنید.',
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
                {levels.length > 1 ? (
                  <div className="store-level-chips" role="group" aria-label="فیلتر سطح CEFR">
                    <button
                      type="button"
                      aria-pressed={level === null}
                      onClick={() => setLevel(null)}
                    >
                      همه
                    </button>
                    {levels.map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={level === item}
                        onClick={() => setLevel(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
                {visibleCatalogue.length === 0 ? (
                  <div className="store-empty">
                    <Bobo expression="encourage" size={96} />
                    <p>هنوز بسته‌ای برای عرضه آماده نیست.</p>
                    <p className="store-empty-hint">به‌زودی بسته‌های تازه اینجا اضافه می‌شوند.</p>
                  </div>
                ) : (
                  <ul className="store-pack-list">
                    {visibleCatalogue.map((pack) => {
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
                          {pack.coverObjectKey ? (
                            <img
                              className="store-pack-cover"
                              src={`/api/store/covers/${encodeURIComponent(pack.id)}`}
                              alt={`کاور ${pack.name}`}
                            />
                          ) : (
                            <div
                              className="store-pack-cover store-pack-cover-placeholder"
                              aria-label={`کاور پیش‌فرض ${pack.name}`}
                            >
                              {pack.targetCefr}
                            </div>
                          )}
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

              {(purchases === 'error' || purchases.length > 0) && (
                <section className="store-section" aria-labelledby="store-my-purchases">
                  <h2 id="store-my-purchases">خریدهای من</h2>
                  {/* Always mounted so screen readers announce each new re-check outcome. */}
                  <p className="store-owned-note" role="status">
                    {checkNote?.text ?? ''}
                  </p>
                  {purchases === 'error' ? (
                    <p className="store-empty-hint" role="alert">
                      فهرست خریدها خوانده نشد؛ بعداً دوباره تلاش کنید.
                    </p>
                  ) : (
                    <ul className="store-owned-list">
                      {purchases.map((item) => (
                        <li
                          key={item.purchaseId}
                          className="store-owned-item"
                          data-purchase-status={item.status}
                        >
                          <span className="store-owned-name">
                            {item.packName ?? item.packId} ·{' '}
                            {formatPrice({
                              isFree: false,
                              priceTomans: item.amountTomans,
                            } as CataloguePack)}
                          </span>
                          <span className="store-owned-meta">
                            {purchaseStatusLabels[item.status] ?? item.status}
                            {item.orderCode ? (
                              <>
                                {' · سفارش '}
                                <bdi className="store-order-code">{item.orderCode}</bdi>
                              </>
                            ) : null}
                            {item.referenceId
                              ? ` · کد رهگیری ${toPersianDigits(item.referenceId)}`
                              : ''}
                          </span>
                          {(item.status === 'pending' || item.status === 'cancelled') && (
                            <button
                              type="button"
                              className="store-retry"
                              // aria-disabled, not disabled: a disabled button drops keyboard focus.
                              aria-disabled={checking === item.purchaseId}
                              onClick={() => void recheck(item.purchaseId)}
                            >
                              {checking === item.purchaseId ? 'در حال بررسی…' : 'بررسی دوباره'}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <LearnerNav current="store" onNavigate={onNavigate} />
    </main>
  );
}
