'use client';

import React, { useCallback, useEffect, useState } from 'react';

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

async function saveStatus(
  user: User,
  status: AccountStatus,
  reason: string,
): Promise<{ ok: true; user: User; alreadyApplied: boolean } | { ok: false; message: string }> {
  const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  try {
    const response = await fetch('/api/support/users/status', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-learnbox-csrf-token': csrfToken,
        'idempotency-key': createClientKey(),
      },
      body: JSON.stringify({ userId: user.id, status, reason: reason.trim() }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { status: string; user: User };
      return {
        ok: true,
        user: payload.user,
        alreadyApplied: payload.status === 'idempotent' || payload.status === 'unchanged',
      };
    }
    if (response.status === 401)
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    if (response.status === 428)
      return { ok: false, message: 'احراز هویت مجدد لازم است؛ دوباره وارد شوید.' };
    if (response.status === 400)
      return { ok: false, message: 'دلیل واردشده پذیرفته نشد؛ آن را کامل‌تر بنویسید.' };
    if (response.status === 404)
      return { ok: false, message: 'نقش شما اجازهٔ تغییر وضعیت حساب را ندارد.' };
    return { ok: false, message: 'تغییر وضعیت حساب با خطا روبه‌رو شد.' };
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
  const [selected, setSelected] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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

  function openUser(user: User) {
    setSelected(user);
    setReason('');
    setNotice(null);
    setFormError(null);
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

  return (
    <section className="users-management" aria-labelledby="users-title">
      <div className="users-header">
        <h2 id="users-title">مدیریت کاربران</h2>
        <span className="users-total">{total} کاربر</span>
      </div>

      <div className="users-search">
        <input
          type="search"
          placeholder="جستجو با شماره موبایل یا نام..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="users-search-input"
        />
      </div>

      {error && (
        <p className="users-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="users-loading">در حال بارگذاری...</p>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>ردیف</th>
                <th>شماره موبایل</th>
                <th>نام</th>
                <th>وضعیت حساب</th>
                <th>تاریخ ثبت‌نام</th>
                <th>کارت‌ها</th>
                <th>مرورها</th>
                <th>آخرین فعالیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td dir="ltr">{formatPhone(user.phone)}</td>
                  <td>{fullName(user)}</td>
                  <td>
                    <span
                      className={
                        user.status === 'disabled'
                          ? 'users-status users-status-disabled'
                          : 'users-status users-status-active'
                      }
                    >
                      {user.status === 'disabled' ? 'غیرفعال موقت' : 'فعال'}
                    </span>
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{user.cardsStarted}</td>
                  <td>{user.reviewCount}</td>
                  <td>{formatDate(user.lastActivityAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="users-detail-btn"
                      onClick={() => openUser(user)}
                    >
                      جزئیات
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={9} className="users-empty">
                    کاربری یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="user-detail-overlay" onClick={() => setSelected(null)}>
          <div
            className="user-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="user-detail-header">
              <h3 id="user-detail-title">جزئیات کاربر</h3>
              <button type="button" aria-label="بستن" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>

            <dl className="user-detail-info">
              <div>
                <dt>شماره</dt>
                <dd dir="ltr">{formatPhone(selected.phone)}</dd>
              </div>
              <div>
                <dt>نام</dt>
                <dd>{fullName(selected)}</dd>
              </div>
              <div>
                <dt>وضعیت حساب</dt>
                <dd>
                  <span
                    className={
                      selected.status === 'disabled'
                        ? 'users-status users-status-disabled'
                        : 'users-status users-status-active'
                    }
                  >
                    {selected.status === 'disabled' ? 'غیرفعال موقت' : 'فعال'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>ثبت‌نام</dt>
                <dd>{formatDate(selected.createdAt)}</dd>
              </div>
              <div>
                <dt>کارت‌های شروع‌شده</dt>
                <dd>{selected.cardsStarted}</dd>
              </div>
              <div>
                <dt>کل مرورها</dt>
                <dd>{selected.reviewCount}</dd>
              </div>
              <div>
                <dt>آخرین مرور</dt>
                <dd>{formatDate(selected.lastActivityAt)}</dd>
              </div>
            </dl>

            <div className="user-status-form">
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
                    className="users-suspend-btn"
                    disabled={saving || reasonTooShort}
                    onClick={() => void applyStatus(selected, 'disabled')}
                  >
                    {saving ? 'در حال ثبت...' : 'غیرفعال‌سازی موقت حساب'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="users-reactivate-btn"
                    disabled={saving || reasonTooShort}
                    onClick={() => void applyStatus(selected, 'active')}
                  >
                    {saving ? 'در حال ثبت...' : 'فعال‌سازی مجدد حساب'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
