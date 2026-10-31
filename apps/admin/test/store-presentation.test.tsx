// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreListingsWorkspace } from '../app/components/StoreListingsWorkspace';

/**
 * The Store screen's visual and honesty contract (Stage 6).
 *
 * Two things are pinned here. First the approved vocabulary from
 * `prototypes/admin-ui-v1/store.html@8b3e050d`: the reference's cards, KPI grid, two-column split,
 * table cells, order list and gateway health rows — not a second parallel implementation, which is
 * what this screen shipped before.
 *
 * Second, and the reason this file exists at all: the reference presents «درآمد این ماه»,
 * «میانگین سبد» and a per-pack «فروش» column over mock data and admits so in its own banner. None
 * of those has a backend aggregate. A screen that prints a plausible number it cannot source is
 * worse than one that admits the gap, so the tests below assert that no revenue or sales figure is
 * rendered anywhere, that unavailable capabilities are labelled «پیاده‌سازی نشده» rather than
 * «غیرفعال» (which would imply a switch someone could find), and that price is neither shown as
 * editable nor sendable.
 */

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: async () => ({ id: 'credential' }),
}));

const paidPack = {
  packId: 'learnbox-start-a1-essentials',
  packDisplayName: 'بستهٔ پایهٔ شروع',
  packStatus: 'published',
  category: 'essentials',
  isFree: false,
  priceTomans: 180000,
  listing: {
    storeStatus: 'listed' as const,
    featured: true,
    displayOrder: 1,
    coverObjectKey: 'covers/start-a1.webp',
    commercialSummary: 'بستهٔ شروع',
    listedAt: '2026-10-01T08:00:00Z',
  },
};

const freePack = {
  packId: 'learnbox-free-taster',
  packDisplayName: 'بستهٔ رایگان',
  packStatus: 'draft',
  category: null,
  isFree: true,
  priceTomans: null,
  listing: undefined,
};

const pricelessPaidPack = {
  packId: 'learnbox-paid-no-price',
  packDisplayName: 'بستهٔ پولی بدون قیمت',
  packStatus: 'approved',
  category: 'grammar',
  isFree: false,
  priceTomans: null,
  listing: undefined,
};

const transaction = {
  transactionId: 'pe_01HZX',
  userId: 'u_123',
  packId: paidPack.packId,
  packDisplayName: paidPack.packDisplayName,
  amountTomans: 180000,
  provider: 'zarinpal',
  environment: 'production',
  status: 'verified',
  providerPurchaseId: 'A000000000000000000000000000000001',
  providerReference: '98765432101',
  createdAt: '2026-10-10T09:00:00Z',
  updatedAt: '2026-10-10T09:02:00Z',
  verifiedAt: '2026-10-10T09:02:00Z',
  // Fields the transactions API returns since the commerce core (a pre-order legacy attempt).
  orderCode: null,
  orderStatus: null,
  providerAmount: null,
  providerCurrency: null,
  reviewReason: null,
  lastProviderCode: null,
  checkCount: 0,
  lastCheckedAt: null,
  recheckPending: false,
  recheckRequestedAt: null,
  autoCheck: 'settled',
};

const configuration = {
  state: 'disabled' as const,
  enabled: false,
  environment: null,
  provider: 'zarinpal',
  verifiedCount: 0,
  pendingCount: 0,
  failedCount: 0,
  lastVerifiedAt: null,
};

let container: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

type Route = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

function stubFetch(routes: Array<[string, Route]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const match = routes.find(([prefix]) => url.startsWith(prefix));
      if (!match) return Response.json({}, { status: 404 });
      return match[1](init, url);
    }),
  );
}

type Options = {
  listings?: unknown[];
  transactions?: unknown[];
  configuration?: unknown;
  listingsStatus?: number;
  report?: unknown;
};

const defaultReport = {
  from: null,
  to: null,
  verifiedCount: 0,
  revenueTomans: 0,
  pendingCount: 0,
  failedCount: 0,
  packs: [],
};

async function render(options: Options = {}) {
  stubFetch([
    [
      '/api/store/listings',
      () =>
        options.listingsStatus
          ? new Response('no', { status: options.listingsStatus })
          : Response.json({
              listings: options.listings ?? [paidPack, freePack, pricelessPaidPack],
            }),
    ],
    [
      '/api/store/payment-config',
      () => Response.json({ configuration: options.configuration ?? configuration }),
    ],
    ['/api/store/transactions', () => Response.json({ transactions: options.transactions ?? [] })],
    ['/api/store/sales-report', () => Response.json({ report: options.report ?? defaultReport })],
  ]);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  await act(async () => {
    root?.render(createElement(StoreListingsWorkspace as FunctionComponent));
    await Promise.resolve();
  });
}

function text() {
  return container?.textContent ?? '';
}

function query(selector: string) {
  return container?.querySelector(selector) ?? null;
}

describe('StoreListingsWorkspace presentation', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('renders the approved shell, split and table vocabulary — not a parallel one', async () => {
    await render();

    expect(query('main.admin-shell.cp-workspace#store')).not.toBeNull();
    expect(query('.split-wide')).not.toBeNull();
    expect(query('.split-wide > .card')).not.toBeNull();
    expect(query('.split-wide > .stack')).not.toBeNull();
    expect(query('table.tbl[data-store-table="listings"]')).not.toBeNull();
    expect(query('.tbl .cell-main .t-name')).not.toBeNull();
    expect(query('.tbl-foot')).not.toBeNull();
    // The pre-Stage-6 implementation had its own unstyled table class and no shared card.
    expect(query('.data-table')).toBeNull();
  });

  it('shows only counts it can source, and no revenue or sales figure anywhere', async () => {
    await render();

    expect(query('[data-store-kpi="paid-packs"]')?.textContent).toBe('۲');
    expect(query('[data-store-kpi="listed-packs"]')?.textContent).toBe('۱');
    expect(query('[data-store-kpi="featured-packs"]')?.textContent).toBe('۱');
    expect(query('[data-store-kpi="priceless-paid-packs"]')?.textContent).toBe('۱');
    // Revenue/sales now have a real aggregate, surfaced via the «گزارش فروش» dialog.
    expect(query('[data-store-state="metrics-gap"]')).not.toBeNull();
    expect(text()).toContain('درآمد و شمار فروش واقعی را دکمهٔ «گزارش فروش» نشان می‌دهد');
    // The notice is allowed to NAME the missing metrics; no KPI may present one as a figure.
    expect(
      [...(container?.querySelectorAll('.kpi-label') ?? [])].map((n) => n.textContent),
    ).toEqual(['بسته‌های پولی', 'فهرست‌شده در فروشگاه', 'بستهٔ ویژه', 'پولی بدون قیمت']);
    for (const value of [...(container?.querySelectorAll('.kpi-value') ?? [])]) {
      expect(value.textContent).not.toContain('تومان');
    }
    // No per-pack sales column on the main table; the real count lives in the report dialog.
    expect([...(container?.querySelectorAll('th') ?? [])].map((th) => th.textContent)).toEqual([
      'بسته',
      'وضعیت محتوا',
      'قیمت',
      'وضعیت فروشگاه',
      '',
    ]);
    expect(query('.tbl-foot .muted')?.textContent).toContain('شمار فروش هر بسته');
  });

  it('presents canonical pack state read-only, with price never editable', async () => {
    await render();

    const row = query(`[data-store-pack="${paidPack.packId}"]`);
    // Stage 11: one separator across Admin — the frozen prototype's `fa(toLocaleString('en-US'))`.
    expect(row?.textContent).toContain('۱۸۰,۰۰۰ تومان');
    expect(row?.querySelector('.badge.b-green')?.textContent).toBe('فهرست‌شده');
    expect(row?.querySelector('.badge.b-amber')?.textContent).toBe('ویژه');
    expect(row?.querySelector('.lvl')?.textContent).toBe('منتشرشده');
    expect(query(`[data-store-pack="${freePack.packId}"]`)?.textContent).toContain('رایگان');
    // A paid pack with no price cannot be sold; the operator sees that, phrased as a fact.
    expect(query(`[data-store-pack="${pricelessPaidPack.packId}"]`)?.textContent).toContain(
      'قیمت ثبت نشده',
    );

    await act(async () => {
      [...(row?.querySelectorAll('button') ?? [])]
        .find((button) => button.textContent === 'ویرایش تجاری')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const dialog = query('.cp-modal');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('#store-status')).not.toBeNull();
    expect(dialog?.querySelector('#store-order')).not.toBeNull();
    expect(dialog?.querySelector('#store-featured')).not.toBeNull();
    expect(dialog?.querySelector('#store-cover-upload')).not.toBeNull();
    expect(dialog?.querySelector('#store-summary')).not.toBeNull();
    // The reference's editor is a price-and-discount form. Both are business-rule violations here.
    expect(dialog?.textContent).toContain('قابل تغییر نیست');
    expect(dialog?.textContent).toContain('تخفیف و کد تخفیف در سامانه پیاده‌سازی نشده است');
    expect(
      [...(dialog?.querySelectorAll('input, select, textarea') ?? [])].map((f) => f.id),
    ).toEqual([
      'store-status',
      'store-order',
      'store-featured',
      'store-cover-upload',
      'store-summary',
    ]);
  });

  it('tells the truth about the gateway: unconfigured, and no switch to flip', async () => {
    await render();

    expect(query('[data-payments-config="disabled"]')).not.toBeNull();
    expect(query('[data-payments-warning="inactive"]')?.textContent).toContain(
      'درگاه پرداخت فعال نیست',
    );
    // The GATEWAY row's own indicator must follow the gateway's state — not merely exist
    // somewhere on the card, where the two unimplemented rows also carry a dim dot.
    const gatewayRow = container?.querySelector('[data-payments-config] .health-row');
    expect(gatewayRow?.textContent).toContain('درگاه زرین‌پال');
    expect(gatewayRow?.querySelector('.pulse')?.className).toBe('pulse off');
    expect(text()).toContain('تنظیم نشده');
    // Capabilities that do not exist are not dressed up as switched-off features.
    const unavailable = [...(container?.querySelectorAll('.unavailable') ?? [])].map(
      (node) => node.textContent,
    );
    expect(unavailable.filter((label) => label === 'پیاده‌سازی نشده')).toHaveLength(2);
    expect(text()).toContain('صدور فاکتور');
    expect(text()).toContain('بازگشت وجه');
    // The credential is a server environment variable; Admin says so instead of offering a field.
    expect(text()).toContain('ZARINPAL_MERCHANT_ID');
    expect(query('input[name="merchantId"]')).toBeNull();
    // And there is no way to create or activate a gateway from the UI.
    const labels = [...(container?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
    for (const forbidden of ['فعال‌سازی', 'افزودن درگاه', 'ثبت پرداخت', 'خرید']) {
      expect(labels.some((label) => label?.includes(forbidden))).toBe(false);
    }
  });

  it('distinguishes a configured-but-unproven gateway from a ready one', async () => {
    await render({ configuration: { ...configuration, state: 'unproven', enabled: true } });

    expect(query('[data-payments-config="unproven"]')).not.toBeNull();
    const gatewayRow = container?.querySelector('[data-payments-config] .health-row');
    expect(gatewayRow?.querySelector('.pulse')?.className).toBe('pulse warn');
    expect(text()).toContain('در انتظار نخستین پرداخت موفق');
    expect(text()).toContain('قابل اثبات نیست');
  });

  it('renders real transactions on the reference list, with full detail one click away', async () => {
    await render({
      transactions: [transaction, { ...transaction, transactionId: 'pe_02', status: 'pending' }],
    });

    expect(query('.list[data-payments-table="transactions"]')).not.toBeNull();
    expect(query('.list-row .list-title')?.textContent).toBe(paidPack.packDisplayName);
    expect(query('.list-row .list-sub .keep-latin')?.textContent).toBe('pe_01HZX');
    expect(query('[data-transaction-status="verified"]')?.className).toContain('b-green');
    expect(query('[data-transaction-status="pending"]')?.className).toContain('b-amber');

    await act(async () => {
      (query('.list-row button') as HTMLButtonElement).click();
    });
    // Nothing the eight-column table used to show is lost to the narrower column.
    const dialog = query('.cp-modal');
    expect(dialog?.textContent).toContain('کد رهگیری');
    expect(dialog?.textContent).toContain('98765432101');
    expect(dialog?.textContent).toContain('شناسهٔ خرید درگاه');
    expect(dialog?.querySelector('.dl')).not.toBeNull();
  });

  it('says plainly that there are no transactions yet, instead of showing zeroes', async () => {
    await render();

    expect(query('[data-payments-state="empty"] .empty')).not.toBeNull();
    expect(text()).toContain('هنوز هیچ تراکنشی ثبت نشده است');
  });

  it('reuses the shared loading, empty and error states', async () => {
    await render({ listings: [] });
    expect(query('.store-state-pad .empty')).not.toBeNull();
    expect(text()).toContain('هیچ بستهٔ کانونی وجود ندارد');

    if (root) await act(async () => root?.unmount());
    container?.remove();

    await render({ listingsStatus: 500 });
    expect(query('.err-block.rose')).not.toBeNull();
    expect(text()).toContain('خواندن وضعیت فروشگاه ممکن نشد');
    expect(query('table.tbl')).toBeNull();
  });

  it('shows the role and flag gates in the amber tone, not as a server error', async () => {
    await render({ listingsStatus: 404 });
    expect(query('.err-block.amber')).not.toBeNull();
    expect(text()).toContain('غیرفعال است');
  });

  it('opens a real sales report with live figures when the button is clicked', async () => {
    await render({
      report: {
        from: null,
        to: null,
        verifiedCount: 2,
        revenueTomans: 20000,
        pendingCount: 0,
        failedCount: 0,
        packs: [
          {
            packId: 'a1-animal-names-basic-5',
            packDisplayName: 'نام حیوانات: پنج واژه‌ی پایه',
            verifiedCount: 2,
            revenueTomans: 20000,
          },
        ],
        byProvider: [{ provider: 'zarinpal', verifiedCount: 2, revenueTomans: 20000 }],
        byChannel: [{ channel: 'web_zarinpal', verifiedCount: 2, revenueTomans: 20000 }],
      },
    });

    const reportButton = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('گزارش فروش'),
    ) as HTMLButtonElement;
    expect(reportButton).toBeDefined();
    expect(reportButton.disabled).toBe(false);

    await act(async () => {
      reportButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = query('.cp-modal');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('[data-report-kpi="verified-count"]')?.textContent).toBe('۲');
    expect(dialog?.querySelector('[data-report-kpi="revenue"]')?.textContent).toBe('۲۰,۰۰۰');
    expect(dialog?.textContent).toContain('نام حیوانات: پنج واژه‌ی پایه');
    expect(dialog?.textContent).toContain('تفکیک بر اساس درگاه');
    expect(dialog?.textContent).toContain('زرین‌پال');
    expect(dialog?.textContent).toContain('تفکیک بر اساس کانال خرید');
    expect(dialog?.textContent).toContain('وب / زرین‌پال');
  });
});
