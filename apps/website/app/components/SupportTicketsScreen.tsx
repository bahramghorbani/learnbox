'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { LearnerSupportTicket, SupportTicketStatus } from '../../lib/support-tickets-store';

const labels: Record<SupportTicketStatus, string> = {
  open: 'در انتظار پاسخ',
  answered: 'پاسخ داده شده',
  closed: 'بسته شده',
};

function ticketReference(ticketNumber: number) {
  return `TK${ticketNumber}`;
}

function ticketDate(value: string) {
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  } catch {
    // Older WebViews can lack the locale/date-style data; a ticket list must not crash the app.
    return value.replace('T', ' ').replace(/\+00(?::00)?$/, ' UTC');
  }
}

function newRequestId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else bytes.forEach((_, index) => (bytes[index] = Math.floor(Math.random() * 256)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
}

export function SupportTicketsScreen({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const [tickets, setTickets] = useState<LearnerSupportTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<LearnerSupportTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/learner/support/tickets', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('tickets');
      const payload = (await response.json()) as { tickets: LearnerSupportTicket[] };
      setTickets(payload.tickets);
    } catch {
      setError('دریافت تیکت‌ها ممکن نشد. لطفاً دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    requestId.current ??= newRequestId();
    try {
      const response = await fetch('/api/learner/support/tickets', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'idempotency-key': requestId.current },
        body: JSON.stringify({ subject, message }),
      });
      if (response.status === 400) {
        setError('عنوان و متن تیکت باید کامل باشند.');
        return;
      }
      if (!response.ok) throw new Error('create');
      const payload = (await response.json()) as { ticket: LearnerSupportTicket };
      setTickets((current) => [payload.ticket, ...current]);
      setSubject('');
      setMessage('');
      requestId.current = null;
      setSubmittedTicket(payload.ticket);
    } catch {
      setError('ثبت تیکت ممکن نشد. لطفاً دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  if (submittedTicket) {
    return (
      <main
        className="app-shell profile-shell support-ticket-confirmation"
        data-testid="support-ticket-confirmation"
      >
        <section className="profile-card" aria-labelledby="support-ticket-confirmation-title">
          <h1 id="support-ticket-confirmation-title">پیام شما ثبت شد</h1>
          <p>کارشناسان از همین صفحه پاسخ می‌دهند.</p>
          <p className="profile-card-note" dir="ltr">
            {ticketReference(submittedTicket.ticketNumber)}
          </p>
          <button className="primary-button" type="button" onClick={onDone}>
            بازگشت به صفحه اصلی
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell profile-shell" data-testid="learner-support-tickets">
      <header className="profile-brand">
        <button type="button" className="text-button" onClick={onBack}>
          بازگشت به پروفایل
        </button>
        <span className="brand">LearnBox</span>
      </header>
      <section className="profile-intro" aria-labelledby="support-title">
        <h1 id="support-title">پشتیبانی</h1>
        <p>پیام خود را ثبت کنید. پاسخ واحد پشتیبانی همین‌جا نمایش داده می‌شود.</p>
      </section>
      <section className="profile-section" aria-labelledby="new-ticket-title">
        <h2 id="new-ticket-title">تیکت جدید</h2>
        <form className="profile-card support-ticket-form" onSubmit={submit}>
          <label htmlFor="support-subject">عنوان</label>
          <input
            id="support-subject"
            value={subject}
            maxLength={120}
            minLength={3}
            required
            onChange={(event) => setSubject(event.target.value)}
            placeholder="مثلاً: مشکل در فعال‌سازی بسته"
          />
          <label htmlFor="support-message">پیام</label>
          <textarea
            id="support-message"
            value={message}
            maxLength={3000}
            minLength={3}
            required
            rows={5}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="موضوع را با جزئیات بنویسید."
          />
          {error ? (
            <p className="profile-card-note" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'در حال ثبت…' : 'ثبت تیکت'}
          </button>
        </form>
      </section>
      <section className="profile-section" aria-labelledby="my-tickets-title">
        <h2 id="my-tickets-title">تیکت‌های من</h2>
        {loading ? (
          <p className="profile-card-note" role="status">
            در حال بارگذاری…
          </p>
        ) : null}
        {!loading && tickets.length === 0 ? (
          <div className="profile-card">
            <p className="profile-card-note">تیکتی ثبت نکرده‌اید.</p>
          </div>
        ) : null}
        <div className="profile-rows">
          {tickets.map((ticket) => (
            <article className="profile-card" key={ticket.id}>
              <div className="profile-fact">
                <strong dir="ltr">{ticketReference(ticket.ticketNumber)}</strong>
                <span className="profile-fact-value">{labels[ticket.status]}</span>
              </div>
              <strong>{ticket.subject}</strong>
              <p>{ticket.message}</p>
              <small>{ticketDate(ticket.createdAt)}</small>
              {ticket.supportReply ? (
                <div className="profile-card-note" aria-label="پاسخ واحد پشتیبانی">
                  <strong>واحد پشتیبانی LearnBox</strong>
                  <p>{ticket.supportReply}</p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
