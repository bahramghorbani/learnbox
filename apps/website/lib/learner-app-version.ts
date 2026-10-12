/**
 * Learner PWA version, read from the one authoritative source for this product:
 * `apps/website/package.json`, inlined by `next.config.mjs` as
 * `NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION`.
 *
 * Deliberately local to the Learner app. Admin Web and Android carry their own independent
 * version lines (`docs/release/VERSIONING.md`); nothing here may be imported by, or shared
 * with, another product surface.
 *
 * There is no fallback version string on purpose. A build that did not inject its version has
 * no version to tell the truth about, so the UI shows nothing rather than a placeholder that
 * would misreport which build a learner is running.
 */
export function learnerAppVersion(): string {
  const injected = process.env.NEXT_PUBLIC_LEARNBOX_LEARNER_VERSION;
  return typeof injected === 'string' ? injected.trim() : '';
}
