'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { CpModal } from './AdminModal';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { faNum } from './fa-digits';
import { fetchWithStepUp, stepUpMessage, type StepUpOutcome } from './step-up-reauth';

type AccountStatus = 'active' | 'disabled';

type User = {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  status: AccountStatus;
  createdAt: string;
  cardsStarted: number;
  reviewCount: number;
  lastActivityAt: string | null;
};

/**
 * One pack as the support screen must present it (M3.2). Every field is decided by the server:
 * `grant` and `revoke` are the server's own verdicts, so a control is shown only where the backend
 * will actually allow the action — and the server re-decides anyway when the request arrives.
 */
type PackEntitlement = {
  packId: string;
  title: string;
  isFree: boolean;
  published: boolean;
  acquisition: 'free' | 'purchased' | 'support' | null;
  acquiredAt: string | null;
  purchase: { status: string; verifiedAt: string | null; amountTomans: number | null } | null;
  hasAccess: boolean;
  accessVia: 'free_pack' | 'entitlement' | null;
  grant: 'allowed' | 'already_owned' | 'free_pack' | 'disabled_account';
  revoke: 'allowed' | 'not_entitled' | 'purchased' | 'free_acquisition';
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatPhone(phone: string): string {
  if (phone.startsWith('+98')) return '0' + phone.slice(3);
  return phone;
}

function fullName(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || '—';
}

/** Avatar letter. Falls back to a neutral glyph rather than inventing a name. */
function initial(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name ? name.slice(0, 1) : '\u2022';
}

/** Account status in the approved badge treatment. `disabled` is a suspension, not a deletion. */
function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={status === 'disabled' ? 'badge b-rose' : 'badge b-green'}>
      {status === 'disabled' ? 'غیرفعال موقت' : 'فعال'}
    </span>
  );
}

function readBrowserCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** Per-attempt key, so a retry after a network error cannot apply the same change twice. */
function createClientKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const random = Math.floor(Math.random() * 16);
    const value = part === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * What to tell the operator when a guarded mutation did not go through for an authentication
 * reason. `undefined` means "this was not a step-up problem" and the caller maps the status itself.
 *
 * A second 428 AFTER a confirmed passkey is reported rather than re-prompted: `fetchWithStepUp`
 * retries exactly once, which is what keeps a stale clock or a revoked credential from turning
 * into an endless prompt loop.
 */
function stepUpRefusal(stepUp: StepUpOutcome, httpStatus: number): string | undefined {
  if (stepUp !== 'not-required' && stepUp !== 'confirmed') return stepUpMessage(stepUp);
  if (httpStatus === 428) {
    return 'تأیید هویت ثبت شد، اما سرور همچنان احراز هویت تازه می‌خواهد؛ داده‌های واردشده حفظ شده است — یک‌بار دیگر تلاش کنید.';
  }
  return undefined;
}

async function saveStatus(
  user: User,
  status: AccountStatus,
  reason: string,
): Promise<{ ok: true; user: User; alreadyApplied: boolean } | { ok: false; message: string }> {
  const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  // Built once and reused verbatim by the retry inside `fetchWithStepUp`: same body, same
  // idempotency key, so a suspension the server already applied cannot be applied twice.
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      'idempotency-key': createClientKey(),
    },
    body: JSON.stringify({ userId: user.id, status, reason: reason.trim() }),
  };
  try {
    const { response, stepUp } = await fetchWithStepUp('/api/support/users/status', init);
    if (response.ok) {
      const payload = (await response.json()) as { status: string; user: User };
      return {
        ok: true,
        user: payload.user,
        alreadyApplied: payload.status === 'idempotent' || payload.status === 'unchanged',
      };
    }
    const refused = stepUpRefusal(stepUp, response.status);
    if (refused) return { ok: false, message: refused };
    if (response.status === 401)
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    if (response.status === 400)
      return { ok: false, message: 'دلیل واردشده پذیرفته نشد؛ آن را کامل‌تر بنویسید.' };
    if (response.status === 404)
      return { ok: false, message: 'نقش شما اجازهٔ تغییر وضعیت حساب را ندارد.' };
    return { ok: false, message: 'تغییر وضعیت حساب با خطا روبه‌رو شد.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد.' };
  }
}

/**
 * Why the learner can read this pack right now — the canonical reason, not a guess. A free pack is
 * labelled as free for everyone even when an acquisition row exists, because that row is not what
 * grants the access.
 */
function accessLabel(pack: PackEntitlement): { text: string; className: string } {
  if (pack.accessVia === 'free_pack') {
    return { text: 'رایگان برای همهٔ کاربران', className: 'pack-access pack-access-free' };
  }
  if (pack.acquisition === 'purchased') {
    return { text: 'خریداری‌شده (پرداخت تأییدشده)', className: 'pack-access pack-access-paid' };
  }
  if (pack.acquisition === 'support') {
    return { text: 'اعطای پشتیبانی', className: 'pack-access pack-access-support' };
  }
  if (pack.acquisition === 'free') {
    return { text: 'فعال‌سازی رایگان توسط کاربر', className: 'pack-access pack-access-free' };
  }
  return { text: 'بدون دسترسی', className: 'pack-access pack-access-none' };
}

/** The server's reason for offering no action, said plainly instead of hiding a dead button. */
function blockedReason(pack: PackEntitlement): string | null {
  if (pack.grant === 'free_pack') return 'این بسته برای همهٔ کاربران رایگان است و اعطا لازم نیست.';
  if (pack.grant === 'disabled_account') {
    return 'حساب غیرفعال است؛ ابتدا آن را فعال کنید تا دسترسی معنا پیدا کند.';
  }
  if (pack.revoke === 'purchased') {
    return 'این دسترسی از یک پرداخت تأییدشده آمده است؛ لغو دستی انجام نمی‌شود و نیازمند سیاست بازپرداخت است.';
  }
  if (pack.revoke === 'free_acquisition') {
    return 'دسترسی از قانون رایگان بودن بسته می‌آید؛ حذف این ردیف دسترسی را لغو نمی‌کند.';
  }
  return null;
}

async function savePackEntitlement(
  userId: string,
  packId: string,
  action: 'grant' | 'revoke',
  reason: string,
): Promise<
  | { ok: true; pack: PackEntitlement; alreadyApplied: boolean }
  | { ok: false; message: string; pack?: PackEntitlement }
> {
  const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      'idempotency-key': createClientKey(),
    },
    body: JSON.stringify({ userId, packId, action, reason: reason.trim() }),
  };
  try {
    const { response, stepUp } = await fetchWithStepUp('/api/support/users/packs', init);
    if (response.ok) {
      const payload = (await response.json()) as { status: string; pack: PackEntitlement };
      return { ok: true, pack: payload.pack, alreadyApplied: payload.status === 'idempotent' };
    }
    // 409 = the server refused on provenance grounds. Its verdict is the message, and the
    // refreshed row it returns replaces whatever this screen believed.
    if (response.status === 409) {
      const payload = (await response.json()) as { verdict: string; pack: PackEntitlement };
      const messages: Record<string, string> = {
        purchased: 'این دسترسی خریداری‌شده است و با لغو دستی حذف نمی‌شود.',
        free_acquisition: 'این بسته رایگان است؛ لغو دستی دسترسی را عوض نمی‌کند.',
        not_entitled: 'دسترسی اعطایی‌ای برای لغو وجود ندارد.',
        already_owned: 'کاربر از قبل این دسترسی را دارد.',
        disabled_account: 'حساب غیرفعال است؛ ابتدا آن را فعال کنید.',
        free_pack: 'این بسته برای همه رایگان است و اعطا لازم نیست.',
      };
      return {
        ok: false,
        message: messages[payload.verdict] ?? 'این اقدام برای این بسته مجاز نیست.',
        pack: payload.pack,
      };
    }
    const refused = stepUpRefusal(stepUp, response.status);
    if (refused) return { ok: false, message: refused };
    if (response.status === 401)
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    if (response.status === 400)
      return { ok: false, message: 'دلیل واردشده پذیرفته نشد؛ آن را کامل‌تر بنویسید.' };
    if (response.status === 404)
      return { ok: false, message: 'نقش شما اجازهٔ تغییر دسترسی بسته را ندارد.' };
    return { ok: false, message: 'تغییر دسترسی بسته با خطا روبه‌رو شد.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد.' };
  }
}

export function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The 404 the support gate returns to a role without `super_admin` — shown, never softened. */
  const [denied, setDenied] = useState(false);
  /** Refines the rows already loaded. Not a server query: see the footer, which says so. */
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [selected, setSelected] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackEntitlement[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState<string | null>(null);
  /** The action awaiting explicit confirmation, so nothing is granted or revoked on one click. */
  const [pending, setPending] = useState<{ packId: string; action: 'grant' | 'revoke' } | null>(
    null,
  );
  const [packReason, setPackReason] = useState('');
  const [packNotice, setPackNotice] = useState<string | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [packSaving, setPackSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      const response = await fetch(`/api/support/users?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      // 404 is the gate's deliberate answer to a role that may not use this surface: it must read
      // as "not allowed", not as "the server broke", and it is not retried.
      if (response.status === 404) {
        setDenied(true);
        setUsers([]);
        setTotal(0);
        return;
      }
      setDenied(false);
      if (!response.ok) throw new Error('خطا در دریافت لیست کاربران');
      const data = (await response.json()) as { users: User[]; total: number };
      setUsers(data.users);
      setTotal(data.total);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const selectedId = selected?.id ?? null;

  const fetchPacks = useCallback(async (userId: string) => {
    setPacksLoading(true);
    setPacksError(null);
    try {
      const response = await fetch(
        `/api/support/users/packs?userId=${encodeURIComponent(userId)}`,
        {
          credentials: 'same-origin',
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error('خطا در دریافت دسترسی بسته‌ها');
      const data = (await response.json()) as { packs: PackEntitlement[] };
      setPacks(data.packs);
    } catch (caught) {
      setPacks([]);
      setPacksError((caught as Error).message);
    } finally {
      setPacksLoading(false);
    }
  }, []);

  // The entitlement view is re-read whenever the selected learner changes, and again after a
  // suspension changes status, because status decides whether a grant is legitimate at all.
  useEffect(() => {
    if (!selectedId) {
      setPacks([]);
      return;
    }
    void fetchPacks(selectedId);
  }, [selectedId, selected?.status, fetchPacks]);

  function openUser(user: User) {
    setSelected(user);
    setReason('');
    setNotice(null);
    setFormError(null);
    setPending(null);
    setPackReason('');
    setPackNotice(null);
    setPackError(null);
  }

  async function applyPackEntitlement(packId: string, action: 'grant' | 'revoke') {
    if (!selected) return;
    setPackSaving(true);
    setPackError(null);
    setPackNotice(null);
    const result = await savePackEntitlement(selected.id, packId, action, packReason);
    setPackSaving(false);
    if (result.pack) {
      const updated = result.pack;
      setPacks((rows) => rows.map((row) => (row.packId === updated.packId ? updated : row)));
    }
    if (!result.ok) {
      setPackError(result.message);
      return;
    }
    setPending(null);
    setPackReason('');
    setPackNotice(
      result.alreadyApplied
        ? 'این درخواست قبلاً ثبت شده بود؛ تغییر تازه‌ای اعمال نشد.'
        : action === 'grant'
          ? 'دسترسی اعطا شد و در اپلیکیشن کاربر فعال است.'
          : 'دسترسی اعطایی لغو شد و کاربر دیگر به این بسته دسترسی ندارد.',
    );
  }

  async function applyStatus(user: User, status: AccountStatus) {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    const result = await saveStatus(user, status, reason);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setSelected(result.user);
    setUsers((rows) => rows.map((row) => (row.id === result.user.id ? result.user : row)));
    setReason('');
    setNotice(
      result.alreadyApplied
        ? 'این حساب از قبل در همین وضعیت بود؛ تغییری ثبت نشد.'
        : status === 'disabled'
          ? 'حساب موقتاً غیرفعال شد و نشست‌های فعال قطع شدند.'
          : 'حساب دوباره فعال شد؛ کاربر باید مجدداً وارد شود.',
    );
  }

  const reasonTooShort = reason.trim().length < 3;

  const visible =
    statusFilter === 'all' ? users : users.filter((user) => user.status === statusFilter);
  const activeCount = users.filter((user) => user.status === 'active').length;
  const disabledCount = users.length - activeCount;
  const filters: ReadonlyArray<{ key: 'all' | AccountStatus; label: string; count: number }> = [
    { key: 'all', label: 'همه', count: users.length },
    { key: 'active', label: 'فعال', count: activeCount },
    { key: 'disabled', label: 'غیرفعال موقت', count: disabledCount },
  ];

  return (
    <section className="users-management" aria-labelledby="users-title">
      <div className="page-head">
        <div>
          <h2 id="users-title">کاربران</h2>
          <p>همان کاربران canonical سامانهٔ LearnBox؛ وضعیت حساب و دسترسی بسته‌ها.</p>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <span className="field grow">
            <input
              type="search"
              className="users-search-input"
              placeholder="جستجو با شماره موبایل یا نام…"
              aria-label="جستجوی کاربر"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
          {/* Refines what is on screen. The server has no status filter, so the footer states how
              many rows this is out of — a chip must never look like a query over every account. */}
          <div className="chips">
            {filters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={statusFilter === filter.key ? 'chip on' : 'chip'}
                aria-pressed={statusFilter === filter.key}
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label} ({faNum(filter.count)})
              </button>
            ))}
          </div>
        </div>

        {denied ? (
          <div className="users-state-pad">
            <ErrorState
              tone="amber"
              title="دسترسی به بخش کاربران مجاز نیست"
              description="این صفحه فقط برای نقش super_admin باز است. اگر باید به آن دسترسی داشته باشید، از مالک سامانه بخواهید نقش شما را تنظیم کند."
            />
          </div>
        ) : error ? (
          <div className="users-state-pad">
            <ErrorState
              title="دریافت فهرست کاربران ناموفق بود"
              description={error}
              action={
                <button type="button" className="btn" onClick={() => void fetchUsers()}>
                  تلاش دوباره
                </button>
              }
            />
          </div>
        ) : loading ? (
          <div className="users-state-pad">
            <LoadingState label="در حال بارگذاری کاربران…" />
          </div>
        ) : visible.length === 0 ? (
          <div className="users-state-pad">
            <EmptyState
              icon="search"
              title={search ? 'کاربری با این جست‌وجو پیدا نشد.' : 'هنوز کاربری ثبت نشده است.'}
              description={
                statusFilter === 'all'
                  ? undefined
                  : 'در میان کاربران بارگذاری‌شده، کسی با این وضعیت نیست.'
              }
            />
          </div>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>وضعیت حساب</th>
                  <th>کارت‌های شروع‌شده</th>
                  <th>مرورها</th>
                  <th>آخرین فعالیت</th>
                  <th>تاریخ ثبت‌نام</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="cell-main">
                        <span className="avatar" aria-hidden="true">
                          {initial(user)}
                        </span>
                        <div>
                          <div className="t-name">{fullName(user)}</div>
                          <div className="t-sub ltr">{formatPhone(user.phone)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={user.status} />
                    </td>
                    <td>{faNum(user.cardsStarted)}</td>
                    <td>{faNum(user.reviewCount)}</td>
                    <td>{formatDate(user.lastActivityAt)}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td style={{ textAlign: 'left' }}>
                      <button type="button" className="btn sm" onClick={() => openUser(user)}>
                        جزئیات
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tbl-foot">
              <span>
                نمایش {faNum(visible.length)} از {faNum(users.length)} کاربر بارگذاری‌شده
              </span>
              <span>مجموع مطابق جست‌وجو: {faNum(total)}</span>
            </div>
          </>
        )}
      </div>

      {selected && (
        <CpModal
          title="جزئیات کاربر"
          wide
          onClose={() => setSelected(null)}
          footer={
            <button type="button" className="btn ghost" onClick={() => setSelected(null)}>
              بستن
            </button>
          }
        >
          <div className="user-identity">
            <span className="avatar lg" aria-hidden="true">
              {initial(selected)}
            </span>
            <div>
              <div className="t-name">{fullName(selected)}</div>
              <div className="t-sub ltr">{formatPhone(selected.phone)}</div>
            </div>
            <StatusBadge status={selected.status} />
          </div>

          <dl className="dl">
            <div>
              <dt>تاریخ ثبت‌نام</dt>
              <dd>{formatDate(selected.createdAt)}</dd>
            </div>
            <div>
              <dt>آخرین مرور</dt>
              <dd>{formatDate(selected.lastActivityAt)}</dd>
            </div>
            <div>
              <dt>کارت‌های شروع‌شده</dt>
              <dd>{faNum(selected.cardsStarted)}</dd>
            </div>
            <div>
              <dt>کل مرورها</dt>
              <dd>{faNum(selected.reviewCount)}</dd>
            </div>
          </dl>

          <div className="user-status-form">
            <div className="card-title">وضعیت حساب</div>
            <p className="user-status-explainer">
              {selected.status === 'disabled'
                ? 'فعال‌سازی مجدد، دسترسی کاربر را برمی‌گرداند. نشست‌های قطع‌شدهٔ قبلی برنمی‌گردند و کاربر باید دوباره وارد شود.'
                : 'غیرفعال‌سازی موقت است: داده‌ها، پیشرفت یادگیری، بسته‌ها و پرداخت‌ها حفظ می‌شوند و نشست‌های فعال فوراً قطع می‌شوند.'}
            </p>
            <label htmlFor="user-status-reason">دلیل (الزامی)</label>
            <textarea
              id="user-status-reason"
              className="user-status-reason"
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثلاً: درخواست پشتیبانی شمارهٔ ۱۲۳ / بررسی تخلف"
            />
            {formError && (
              <p className="users-error" role="alert">
                {formError}
              </p>
            )}
            {notice && (
              <p className="users-notice" role="status">
                {notice}
              </p>
            )}
            <div className="user-detail-actions">
              {selected.status === 'active' ? (
                <button
                  type="button"
                  className="btn danger"
                  disabled={saving || reasonTooShort}
                  onClick={() => void applyStatus(selected, 'disabled')}
                >
                  {saving ? 'در حال ثبت...' : 'غیرفعال‌سازی موقت حساب'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary"
                  disabled={saving || reasonTooShort}
                  onClick={() => void applyStatus(selected, 'active')}
                >
                  {saving ? 'در حال ثبت...' : 'فعال‌سازی مجدد حساب'}
                </button>
              )}
            </div>
          </div>

          <section className="user-packs" aria-labelledby="user-packs-title">
            <div className="card-title" id="user-packs-title">
              دسترسی بسته‌ها
            </div>
            {packsLoading && <LoadingState label="در حال بارگذاری دسترسی‌ها..." />}
            {packsError && (
              <ErrorState
                title="دریافت دسترسی بسته‌ها ناموفق بود"
                description={packsError}
                action={
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void fetchPacks(selected.id)}
                  >
                    تلاش دوباره
                  </button>
                }
              />
            )}
            {!packsLoading && !packsError && packs.length === 0 && (
              <EmptyState title="بستهٔ فعالی برای نمایش وجود ندارد." />
            )}
            {packNotice && (
              <p className="users-notice" role="status">
                {packNotice}
              </p>
            )}
            {packError && (
              <p className="users-error" role="alert">
                {packError}
              </p>
            )}
            <ul className="user-packs-list">
              {packs.map((pack) => {
                const label = accessLabel(pack);
                const blocked = blockedReason(pack);
                const isPending = pending?.packId === pack.packId;
                return (
                  <li key={pack.packId} className="user-pack-row">
                    <div className="user-pack-head">
                      <span className="user-pack-title">{pack.title}</span>
                      <span className={label.className}>{label.text}</span>
                      {!pack.published && (
                        <span className="pack-access pack-access-none">منتشر نشده</span>
                      )}
                    </div>
                    {pack.purchase && (
                      <p className="user-pack-meta">
                        پرداخت تأییدشده
                        {pack.purchase.amountTomans
                          ? ` — ${pack.purchase.amountTomans.toLocaleString('fa-IR')} تومان`
                          : ''}
                        {pack.purchase.verifiedAt
                          ? ` — ${formatDate(pack.purchase.verifiedAt)}`
                          : ''}
                      </p>
                    )}
                    {pack.acquisition === 'support' && (
                      <p className="user-pack-meta">
                        اعطای پشتیبانی — {formatDate(pack.acquiredAt)}
                      </p>
                    )}
                    {blocked && <p className="user-pack-meta user-pack-blocked">{blocked}</p>}

                    {/* A control appears only where the server has already said the action is
                          legitimate; the request is validated again server-side regardless. */}
                    {!isPending && pack.grant === 'allowed' && (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => {
                          setPending({ packId: pack.packId, action: 'grant' });
                          setPackReason('');
                          setPackError(null);
                          setPackNotice(null);
                        }}
                      >
                        اعطای دسترسی
                      </button>
                    )}
                    {!isPending && pack.revoke === 'allowed' && (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => {
                          setPending({ packId: pack.packId, action: 'revoke' });
                          setPackReason('');
                          setPackError(null);
                          setPackNotice(null);
                        }}
                      >
                        لغو دسترسی اعطایی
                      </button>
                    )}

                    {isPending && (
                      <div className="user-pack-confirm">
                        <p className="user-status-explainer">
                          {pending.action === 'grant'
                            ? 'این بسته بدون هیچ پرداختی برای کاربر باز می‌شود و به‌عنوان «اعطای پشتیبانی» ثبت می‌گردد. سابقهٔ پرداخت ساخته یا تغییر داده نمی‌شود.'
                            : 'هشدار: دسترسی کاربر به این بسته فوراً حذف می‌شود. این اقدام فقط دسترسی اعطایی پشتیبانی را برمی‌دارد و روی پرداخت‌ها اثری ندارد.'}
                        </p>
                        <label htmlFor={`pack-reason-${pack.packId}`}>دلیل (الزامی)</label>
                        <textarea
                          id={`pack-reason-${pack.packId}`}
                          className="user-status-reason"
                          value={packReason}
                          maxLength={500}
                          rows={2}
                          onChange={(event) => setPackReason(event.target.value)}
                          placeholder="مثلاً: تیکت ۴۵۶ — جبران پرداخت ناموفق"
                        />
                        <div className="user-detail-actions">
                          <button
                            type="button"
                            className={pending.action === 'grant' ? 'btn primary' : 'btn danger'}
                            disabled={packSaving || packReason.trim().length < 3}
                            onClick={() => void applyPackEntitlement(pack.packId, pending.action)}
                          >
                            {packSaving
                              ? 'در حال ثبت...'
                              : pending.action === 'grant'
                                ? 'تأیید و اعطای دسترسی'
                                : 'تأیید و لغو دسترسی'}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setPending(null);
                              setPackReason('');
                            }}
                          >
                            انصراف
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </CpModal>
      )}
    </section>
  );
}
