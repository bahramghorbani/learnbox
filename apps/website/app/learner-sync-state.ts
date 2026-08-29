export type LearnerSyncState = 'local-only' | 'server-backed';

export function syncStateText(state: LearnerSyncState): string {
  return state === 'server-backed'
    ? 'این فهرست از سرور LearnBox خوانده شده است.'
    : 'این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و هنوز به سرور وصل نشده است.';
}
