'use client';

import React, { useCallback, useEffect, useState } from 'react';

type User = {
  id: string;
  phone_e164: string;
  first_name: string | null;
  created_at: string;
  review_count: string;
  cards_started: string;
  last_activity: string | null;
};

type UserDetail = {
  user: {
    id: string;
    phone_e164: string;
    first_name: string | null;
    created_at: string;
  };
  stats: {
    cards_started: string;
    total_reviews: string;
    last_review_at: string | null;
  };
  recentReviews: { card_id: string; rating: string; created_at: string }[];
};

type SortField = 'created_at' | 'first_name' | 'phone_e164';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatPhone(phone: string): string {
  if (phone.startsWith('+98')) return '0' + phone.slice(3);
  return phone;
}

export function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortField>('created_at');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      params.set('sort', sort);
      params.set('order', order);
      const res = await fetch(`/api/users?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('خطا در دریافت لیست کاربران');
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, sort, order]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function loadUserDetail(userId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('خطا');
      const data: UserDetail = await res.json();
      setSelectedUser(data);
    } catch {
      setSelectedUser(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function resetProgress(userId: string) {
    if (!confirm('آیا مطمئنید؟ تمام پیشرفت یادگیری این کاربر حذف می‌شود.')) return;
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_progress' }),
    });
    if (res.ok) {
      alert('پیشرفت کاربر با موفقیت حذف شد.');
      void loadUserDetail(userId);
      void fetchUsers();
    }
  }

  function toggleSort(field: SortField) {
    if (sort === field) {
      setOrder(order === 'desc' ? 'asc' : 'desc');
    } else {
      setSort(field);
      setOrder('desc');
    }
  }

  const sortIndicator = (field: SortField) =>
    sort === field ? (order === 'desc' ? ' ↓' : ' ↑') : '';

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
          onChange={(e) => setSearch(e.target.value)}
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
                <th>
                  <button type="button" onClick={() => toggleSort('phone_e164')}>
                    شماره موبایل{sortIndicator('phone_e164')}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort('first_name')}>
                    نام{sortIndicator('first_name')}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort('created_at')}>
                    تاریخ ثبت‌نام{sortIndicator('created_at')}
                  </button>
                </th>
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
                  <td dir="ltr">{formatPhone(user.phone_e164)}</td>
                  <td>{user.first_name ?? '—'}</td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>{user.cards_started}</td>
                  <td>{user.review_count}</td>
                  <td>{formatDate(user.last_activity)}</td>
                  <td>
                    <button
                      type="button"
                      className="users-detail-btn"
                      onClick={() => loadUserDetail(user.id)}
                    >
                      جزئیات
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className="users-empty">
                    کاربری یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(selectedUser || detailLoading) && (
        <div className="user-detail-overlay" onClick={() => setSelectedUser(null)}>
          <div className="user-detail-modal" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <p>در حال بارگذاری...</p>
            ) : selectedUser ? (
              <>
                <div className="user-detail-header">
                  <h3>جزئیات کاربر</h3>
                  <button type="button" onClick={() => setSelectedUser(null)}>
                    ✕
                  </button>
                </div>
                <dl className="user-detail-info">
                  <div>
                    <dt>شماره</dt>
                    <dd dir="ltr">{formatPhone(selectedUser.user.phone_e164)}</dd>
                  </div>
                  <div>
                    <dt>نام</dt>
                    <dd>{selectedUser.user.first_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>ثبت‌نام</dt>
                    <dd>{formatDate(selectedUser.user.created_at)}</dd>
                  </div>
                  <div>
                    <dt>کارت‌های شروع‌شده</dt>
                    <dd>{selectedUser.stats.cards_started}</dd>
                  </div>
                  <div>
                    <dt>کل مرورها</dt>
                    <dd>{selectedUser.stats.total_reviews}</dd>
                  </div>
                  <div>
                    <dt>آخرین مرور</dt>
                    <dd>{formatDate(selectedUser.stats.last_review_at)}</dd>
                  </div>
                </dl>

                {Number(selectedUser.stats.total_reviews) > 0 && (
                  <div className="user-detail-reviews">
                    <h4>آخرین مرورها</h4>
                    <ul>
                      {selectedUser.recentReviews.map((r, i) => (
                        <li key={i}>
                          <span className="review-card-id">{r.card_id.slice(0, 8)}</span>
                          <span className="review-rating">{r.rating}</span>
                          <span className="review-date">{formatDate(r.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="user-detail-actions">
                  <button
                    type="button"
                    className="users-danger-btn"
                    onClick={() => resetProgress(selectedUser.user.id)}
                  >
                    حذف پیشرفت یادگیری
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
