export type LearnerSyncState = 'local-only' | 'server-backed' | 'loading' | 'error' | 'offline';

export function syncStateText(state: LearnerSyncState): string {
  switch (state) {
    case 'server-backed':
      return 'این فهرست از سرور LearnBox خوانده شده است.';
    case 'loading':
      return 'در حال خواندن وضعیت از سرور…';
    case 'error':
      return 'خواندن از سرور ممکن نشد؛ این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است.';
    case 'offline':
      return 'آفلاین؛ فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و تا وصل‌شدن به سرور، همگام‌سازی انجام نمی‌شود.';
    default:
      return 'این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و هنوز به سرور وصل نشده است.';
  }
}
