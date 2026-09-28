import { useId, useState } from 'react';

/**
 * Deliberate account deletion UI (LB-B04).
 *
 * Protection against accidental deletion is layered, because this action cannot be undone:
 *   1. The control lives behind Settings, not on a primary screen.
 *   2. Opening it reveals a plain-language summary of what is removed and what is kept.
 *   3. The learner must retype their own phone number — re-authentication appropriate to the
 *      phone/OTP model, and impossible to trigger by a stray tap.
 *   4. The confirm button stays disabled until something is typed, and disables itself while the
 *      request is in flight so a double tap cannot send two deletions.
 *
 * A stable request id is generated once per attempt so a retry after a dropped connection is
 * idempotent server-side rather than risking a second deletion pass.
 */

export type AccountDeletionResult =
  | { status: 'deleted'; deletionId: string }
  | { status: 'mismatch' }
  | { status: 'unavailable' }
  | { status: 'refused' };

interface DeleteAccountPanelProps {
  onDelete: (input: { confirmPhone: string; requestId: string }) => Promise<AccountDeletionResult>;
  onDeleted: () => void;
  supportUrl: string;
}

function newRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) return cryptoApi.randomUUID();
  return `del-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DeleteAccountPanel({ onDelete, onDeleted, supportUrl }: DeleteAccountPanelProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Held for the whole attempt so every retry of THIS deletion carries the same id.
  const [requestId, setRequestId] = useState(newRequestId);
  const inputId = useId();

  const close = () => {
    setOpen(false);
    setPhone('');
    setError('');
  };

  const submit = async () => {
    if (busy || !phone.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await onDelete({ confirmPhone: phone, requestId });
      if (result.status === 'deleted') {
        onDeleted();
        return;
      }
      if (result.status === 'mismatch') {
        setError('این شماره با شمارهٔ حساب شما یکی نیست. دوباره بررسی کنید.');
      } else if (result.status === 'refused') {
        setError('این حساب از این مسیر قابل حذف نیست؛ لطفاً با پشتیبانی تماس بگیرید.');
      } else {
        setError('حذف حساب همین حالا ممکن نشد. کمی بعد دوباره تلاش کنید.');
        // A failed attempt gets a fresh id: the previous one may have been recorded server-side.
        setRequestId(newRequestId());
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        className="settings-row settings-row-danger"
        type="button"
        onClick={() => setOpen(true)}
      >
        <span className="settings-row-copy">
          <strong>حذف حساب</strong>
          <small>حساب و سابقهٔ یادگیری شما برای همیشه حذف می‌شود.</small>
        </span>
        <span className="profile-row-arrow" aria-hidden="true">
          ←
        </span>
      </button>
    );
  }

  return (
    <section className="delete-account-panel" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">حذف حساب</h2>
      <p>با حذف حساب، این موارد از سرور پاک می‌شوند:</p>
      <ul className="delete-account-list">
        <li>شمارهٔ موبایل و نام شما</li>
        <li>برنامهٔ مرور و سابقهٔ پاسخ‌هایتان</li>
        <li>نشست‌های ورود شما</li>
      </ul>
      <p>این موارد باقی می‌مانند:</p>
      <ul className="delete-account-list">
        <li>یک رکورد کوتاه از خودِ رویداد حذف، بدون شمارهٔ شما و بدون محتوای یادگیری</li>
        <li>در صورت وجود خرید معتبر، سندی که اجازه می‌دهد بعداً همان خرید را بازیابی کنید</li>
        <li>
          نسخه‌های پشتیبان روزانه که حداکثر ۳۰ روز نگهداری می‌شوند و فقط برای بازیابی اضطراری‌اند
        </li>
      </ul>
      <p className="delete-account-warning">
        این کار برگشت‌پذیر نیست. شمارهٔ شما آزاد می‌شود و می‌توانید بعداً دوباره ثبت‌نام کنید، ولی
        سابقهٔ یادگیری بازنمی‌گردد.
      </p>
      <label className="delete-account-label" htmlFor={inputId}>
        برای تأیید، شمارهٔ موبایل خود را وارد کنید
      </label>
      <input
        id={inputId}
        className="delete-account-input"
        type="tel"
        inputMode="tel"
        dir="ltr"
        autoComplete="off"
        value={phone}
        disabled={busy}
        onChange={(event) => setPhone(event.target.value)}
      />
      {error ? (
        <p className="delete-account-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="delete-account-actions">
        <button className="text-button" type="button" onClick={close} disabled={busy}>
          انصراف
        </button>
        <button
          className="delete-account-confirm"
          type="button"
          onClick={() => void submit()}
          disabled={busy || !phone.trim()}
        >
          {busy ? 'در حال حذف…' : 'حذف همیشگی حساب'}
        </button>
      </div>
      <p className="delete-account-support">
        اگر مطمئن نیستید، ابتدا با پشتیبانی صحبت کنید:{' '}
        <a href={supportUrl} target="_blank" rel="noreferrer" dir="ltr">
          @learnboxsupportbot
        </a>
      </p>
    </section>
  );
}
