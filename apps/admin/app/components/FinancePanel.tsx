'use client';
import { useCallback, useEffect, useState } from 'react';

type Gateway = { id: string; name: string; type: string; is_active: boolean; created_at: string };
type Transaction = {
  id: string; amount_tomans: number | null; amount_usdt: number | null;
  status: string; provider_ref: string | null; error_message: string | null;
  created_at: string; completed_at: string | null;
  phone_e164: string | null; first_name: string | null;
  pack_name: string | null; gateway_name: string | null; gateway_type: string | null;
};
type Summary = {
  success_count: string; failed_count: string; pending_count: string;
  total_tomans: string; total_usdt: string;
  today_tomans: string; week_tomans: string; month_tomans: string;
};
type Pagination = { page: number; limit: number; total: number; totalPages: number };

const statusLabels: Record<string, string> = { success: '✅ موفق', failed: '❌ ناموفق', pending: '⏳ در انتظار', expired: '⌛ منقضی' };
const gwTypeLabels: Record<string, string> = { zarinpal: 'زرین‌پال', irankish: 'ایران‌کیش', usdt: 'تتر (USDT)' };

function maskPhone(phone: string | null) {
  if (!phone) return '—';
  return phone.replace(/(\+98|0)(\d{3})(\d{3})(\d{4})/, '$1$2***$4');
}

function formatTomans(val: string | number) {
  return Number(val).toLocaleString('fa-IR') + ' تومان';
}

export function FinancePanel() {
  const [tab, setTab] = useState<'transactions' | 'gateways' | 'summary'>('summary');
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [newGw, setNewGw] = useState({ name: '', type: 'zarinpal' });

  const loadGateways = useCallback(async () => {
    const res = await fetch('/api/gateways', { credentials: 'same-origin' });
    if (res.ok) { const d = await res.json(); setGateways(d.gateways || []); }
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/transactions?summary=true', { credentials: 'same-origin' });
    if (res.ok) { const d = await res.json(); setSummary(d.summary); }
  }, []);

  const loadTransactions = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/transactions?${params}`, { credentials: 'same-origin' });
    if (res.ok) {
      const d = await res.json();
      setTransactions(d.transactions || []);
      setPagination(d.pagination);
    }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    void loadGateways();
    void loadSummary();
    void loadTransactions();
  }, [loadGateways, loadSummary, loadTransactions]);

  const toggleGateway = async (id: string, active: boolean) => {
    await fetch('/api/gateways', {
      method: 'PATCH', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, is_active: active }),
    });
    void loadGateways();
  };

  const addGateway = async () => {
    if (!newGw.name) return;
    await fetch('/api/gateways', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(newGw),
    });
    setNewGw({ name: '', type: 'zarinpal' });
    void loadGateways();
  };

  return (
    <div className="finance-panel">
      <h2>💰 مالی</h2>
      <div className="finance-tabs">
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>خلاصه</button>
        <button className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')}>تراکنش‌ها</button>
        <button className={tab === 'gateways' ? 'active' : ''} onClick={() => setTab('gateways')}>درگاه‌ها</button>
      </div>

      {/* Summary tab */}
      {tab === 'summary' && summary && (
        <div className="finance-summary">
          <div className="summary-grid">
            <div className="summary-card success"><span className="summary-label">فروش امروز</span><span className="summary-value">{formatTomans(summary.today_tomans)}</span></div>
            <div className="summary-card"><span className="summary-label">فروش هفته</span><span className="summary-value">{formatTomans(summary.week_tomans)}</span></div>
            <div className="summary-card"><span className="summary-label">فروش ماه</span><span className="summary-value">{formatTomans(summary.month_tomans)}</span></div>
            <div className="summary-card"><span className="summary-label">کل درآمد</span><span className="summary-value">{formatTomans(summary.total_tomans)}</span></div>
          </div>
          <div className="summary-stats">
            <span>✅ موفق: {Number(summary.success_count).toLocaleString('fa-IR')}</span>
            <span>❌ ناموفق: {Number(summary.failed_count).toLocaleString('fa-IR')}</span>
            <span>⏳ در انتظار: {Number(summary.pending_count).toLocaleString('fa-IR')}</span>
            {Number(summary.total_usdt) > 0 && <span>💵 USDT: {summary.total_usdt}</span>}
          </div>
        </div>
      )}

      {/* Transactions tab */}
      {tab === 'transactions' && (
        <div className="finance-transactions">
          <div className="tx-filters">
            <input placeholder="جستجو: شماره یا شناسه تراکنش" value={search}
              onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadTransactions(1)} />
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }}>
              <option value="">همه وضعیت‌ها</option>
              <option value="success">موفق</option>
              <option value="failed">ناموفق</option>
              <option value="pending">در انتظار</option>
            </select>
            <button onClick={() => void loadTransactions(1)}>🔍</button>
          </div>
          {loading ? <p>در حال بارگذاری...</p> : transactions.length === 0 ? <p>تراکنشی یافت نشد.</p> : (
            <>
              <table className="tx-table">
                <thead><tr>
                  <th>شناسه</th><th>کاربر</th><th>بسته</th><th>مبلغ</th><th>درگاه</th><th>وضعیت</th><th>تاریخ</th>
                </tr></thead>
                <tbody>{transactions.map(tx => (
                  <tr key={tx.id} className={`tx-${tx.status}`}>
                    <td title={tx.provider_ref || tx.id}>{(tx.provider_ref || tx.id).slice(0, 8)}…</td>
                    <td>{maskPhone(tx.phone_e164)}{tx.first_name ? ` (${tx.first_name})` : ''}</td>
                    <td>{tx.pack_name || '—'}</td>
                    <td>{tx.amount_tomans ? formatTomans(tx.amount_tomans) : tx.amount_usdt ? `$${tx.amount_usdt}` : '—'}</td>
                    <td>{tx.gateway_name || gwTypeLabels[tx.gateway_type || ''] || '—'}</td>
                    <td>{statusLabels[tx.status] || tx.status}</td>
                    <td>{new Date(tx.created_at).toLocaleDateString('fa-IR')}</td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="tx-pagination">
                <button disabled={pagination.page <= 1} onClick={() => void loadTransactions(pagination.page - 1)}>« قبلی</button>
                <span>صفحه {pagination.page.toLocaleString('fa-IR')} از {pagination.totalPages.toLocaleString('fa-IR')}</span>
                <button disabled={pagination.page >= pagination.totalPages} onClick={() => void loadTransactions(pagination.page + 1)}>بعدی »</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Gateways tab */}
      {tab === 'gateways' && (
        <div className="finance-gateways">
          <h3>درگاه‌های پرداخت</h3>
          {gateways.length === 0 ? <p>هنوز درگاهی تنظیم نشده.</p> : (
            <div className="gw-list">
              {gateways.map(gw => (
                <div key={gw.id} className={`gw-card ${gw.is_active ? 'active' : 'inactive'}`}>
                  <div className="gw-info">
                    <strong>{gw.name}</strong>
                    <span className="gw-type">{gwTypeLabels[gw.type] || gw.type}</span>
                  </div>
                  <label className="gw-toggle">
                    <input type="checkbox" checked={gw.is_active} onChange={e => void toggleGateway(gw.id, e.target.checked)} />
                    <span>{gw.is_active ? 'فعال' : 'غیرفعال'}</span>
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className="gw-add">
            <h4>افزودن درگاه جدید</h4>
            <input placeholder="نام درگاه" value={newGw.name} onChange={e => setNewGw(p => ({ ...p, name: e.target.value }))} />
            <select value={newGw.type} onChange={e => setNewGw(p => ({ ...p, type: e.target.value }))}>
              <option value="zarinpal">زرین‌پال</option>
              <option value="irankish">ایران‌کیش</option>
              <option value="usdt">تتر (USDT)</option>
            </select>
            <button onClick={() => void addGateway()}>+ افزودن</button>
          </div>
        </div>
      )}
    </div>
  );
}
