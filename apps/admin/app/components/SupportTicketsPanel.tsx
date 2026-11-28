'use client';

import React, { useEffect, useState } from 'react';

import {
  createIdempotencyKey,
  fetchWithStepUp,
  readCsrfToken,
  stepUpRefusal,
} from './step-up-reauth';
import { ErrorState, LoadingState } from './AdminStates';
import { faDateTime } from './fa-dates';

type TicketStatus = 'open' | 'answered' | 'closed';
type Ticket = {
  id: string;
  ticketNumber: number;
  userId: string;
  userPhone: string;
  userFirstName: string | null;
  userLastName: string | null;
  subject: string;
  message: string;
  supportReply: string | null;
  status: TicketStatus;
  createdAt: string;
  respondedAt: string | null;
  closedAt: string | null;
};

const labels: Record<TicketStatus, string> = {
  open: 'در انتظار پاسخ',
  answered: 'پاسخ داده شده',
  closed: 'بسته شده',
};
type TicketFilter = 'all' | TicketStatus;
const filterLabels: Record<TicketFilter, string> = {
  all: 'همه',
  open: 'باز',
  answered: 'پاسخ داده شده',
  closed: 'بسته',
};
const reference = (ticket: Ticket) => `TK${ticket.ticketNumber}`;

type TicketMutationResult = { ok: true; ticket: Ticket } | { ok: false; message: string };

async function mutate(
  ticket: Ticket,
  action: 'answer' | 'close' | 'reopen',
  reply?: string,
): Promise<TicketMutationResult> {
  const csrf = readCsrfToken();
  if (!csrf) return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-learnbox-csrf-token': csrf,
      'idempotency-key': createIdempotencyKey(),
    },
    body: JSON.stringify({
      ticketId: ticket.id,
      action,
      ...(reply ? { reply: reply.trim() } : {}),
    }),
  };
  try {
    const { response, stepUp } = await fetchWithStepUp('/api/support/tickets', init);
    if (response.ok)
      return { ok: true, ticket: ((await response.json()) as { ticket: Ticket }).ticket };
    const refused = stepUpRefusal(stepUp, response.status);
    if (refused) return { ok: false, message: refused };
    if (response.status === 409)
      return { ok: false, message: 'وضعیت تیکت تغییر کرده است؛ فهرست را تازه کنید.' };
    return { ok: false, message: 'ثبت تغییر تیکت ممکن نشد.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد.' };
  }
}

function ticketOwner(ticket: Ticket) {
  const name = `${ticket.userFirstName ?? ''} ${ticket.userLastName ?? ''}`.trim();
  return name || 'کاربر بدون نام';
}

function TicketCard({
  ticket,
  onUpdated,
}: {
  ticket: Ticket;
  onUpdated: (ticket: Ticket) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailId = `ticket-detail-${ticket.id}`;
  async function apply(action: 'answer' | 'close' | 'reopen') {
    if (action === 'answer' && !reply.trim()) {
      setError('پاسخ را بنویسید.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await mutate(ticket, action, reply);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReply('');
    onUpdated(result.ticket);
  }
  return (
    <article className={`support-ticket ${expanded ? 'is-expanded' : ''}`}>
      <button
        type="button"
        className="support-ticket-summary"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${expanded ? 'بستن جزئیات' : 'نمایش جزئیات'} ${reference(ticket)}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="support-ticket-reference" dir="ltr">
          {reference(ticket)}
        </span>
        <span className="support-ticket-primary">
          <strong>{ticket.subject}</strong>
          <span className="support-ticket-owner">
            {ticketOwner(ticket)} <span dir="ltr">· {ticket.userPhone}</span>
          </span>
        </span>
        <span className={`support-ticket-status is-${ticket.status}`}>{labels[ticket.status]}</span>
        <time className="support-ticket-date" dateTime={ticket.createdAt}>
          {faDateTime(ticket.createdAt)}
        </time>
        <span className="support-ticket-chevron" aria-hidden="true">
          {expanded ? '⌃' : '⌄'}
        </span>
      </button>
      {expanded ? (
        <div id={detailId} className="support-ticket-detail">
          <div className="support-ticket-message">
            <span className="support-ticket-kicker">پیام کاربر</span>
            <p>{ticket.message}</p>
          </div>
          {ticket.supportReply ? (
            <div className="support-ticket-reply">
              <span className="support-ticket-kicker">پاسخ پشتیبانی</span>
              <p>{ticket.supportReply}</p>
            </div>
          ) : null}
          {error ? (
            <p className="users-error" role="alert">
              {error}
            </p>
          ) : null}
          {ticket.status === 'open' ? (
            <div className="user-status-form">
              <label htmlFor={`ticket-reply-${ticket.id}`}>پاسخ واحد پشتیبانی</label>
              <textarea
                id={`ticket-reply-${ticket.id}`}
                value={reply}
                maxLength={3000}
                rows={3}
                onChange={(event) => setReply(event.target.value)}
              />
              <button
                type="button"
                className="btn primary"
                disabled={saving || !reply.trim()}
                onClick={() => void apply('answer')}
              >
                {saving ? 'در حال ثبت...' : 'ارسال پاسخ'}
              </button>
            </div>
          ) : null}
          {ticket.status === 'answered' ? (
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => void apply('close')}
            >
              {saving ? 'در حال ثبت...' : 'بستن تیکت'}
            </button>
          ) : null}
          {ticket.status === 'closed' ? (
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => void apply('reopen')}
            >
              {saving ? 'در حال ثبت...' : 'بازگشایی تیکت'}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function SupportTicketsPanel({ userId }: { userId?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TicketFilter>('all');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim().toUpperCase());
      if (filter !== 'all') params.set('status', filter);
      const queryString = params.toString();
      const url = userId
        ? `/api/support/users/tickets?userId=${encodeURIComponent(userId)}`
        : `/api/support/tickets${queryString ? `?${queryString}` : ''}`;
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('tickets');
      const payload = (await response.json()) as { tickets?: unknown; total?: unknown };
      if (!Array.isArray(payload.tickets)) throw new Error('invalid_tickets_response');
      setTickets(payload.tickets as Ticket[]);
      setTotal(typeof payload.total === 'number' ? payload.total : payload.tickets.length);
    } catch {
      setError('دریافت تیکت‌ها ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [userId, filter]);
  const update = (updated: Ticket) =>
    setTickets((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
  return (
    <section className="user-packs" aria-label={userId ? 'تیکت‌های کاربر' : 'تیکت‌های پشتیبانی'}>
      <div className="card-title">{userId ? 'تیکت‌های کاربر' : 'تیکت‌های پشتیبانی'}</div>
      {!userId ? (
        <>
          <div className="toolbar" role="group" aria-label="فیلتر وضعیت تیکت‌ها">
            {(Object.keys(filterLabels) as TicketFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'btn primary' : 'btn'}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {filterLabels[value]}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستجو با TK1001"
              aria-label="جستجوی شماره تیکت"
            />
            <button type="button" className="btn" onClick={() => void load()}>
              جستجو
            </button>
          </div>
          {!loading ? <p className="t-sub">{total} تیکت یافت شد.</p> : null}
        </>
      ) : null}
      {loading ? <LoadingState label="در حال بارگذاری تیکت‌ها..." /> : null}
      {error ? (
        <ErrorState
          title="دریافت تیکت‌ها ناموفق بود"
          description={error}
          action={
            <button type="button" className="btn" onClick={() => void load()}>
              تلاش دوباره
            </button>
          }
        />
      ) : null}
      {!loading && !error && tickets.length === 0 ? (
        <p className="t-sub">تیکتی برای نمایش نیست.</p>
      ) : null}
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} onUpdated={update} />
      ))}
    </section>
  );
}
