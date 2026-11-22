/**
 * Landing version, read from this product's own package.json by next.config.mjs.
 * An uninjected build reports nothing rather than a made-up version.
 */
export function landingAppVersion(): string {
  const injected = process.env.NEXT_PUBLIC_LEARNBOX_LANDING_VERSION;
  return typeof injected === 'string' ? injected.trim() : '';
}
