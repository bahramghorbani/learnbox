export type LearnerSyncState = 'local-only' | 'server-backed' | 'loading' | 'error' | 'offline';

export function syncStateText(state: LearnerSyncState): string {
  switch (state) {
    case 'server-backed':
      return 'کارت‌ها و وضعیت یادگیری با نشست معتبر از سرور خوانده شدند.';
    case 'loading':
      return 'در حال خواندن کارت‌ها و وضعیت یادگیری از سرور…';
    case 'error':
      return 'خواندن داده‌های یادگیری از سرور ممکن نشد؛ محتوای جایگزین نمایش داده نمی‌شود.';
    case 'offline':
      return 'آفلاین؛ بدون نشست معتبر و دادهٔ همگام‌شده محتوای آموزشی نمایش داده نمی‌شود.';
    default:
      return 'برای دیدن محتوای آموزشی، ورود و اتصال به سرور لازم است.';
  }
}
