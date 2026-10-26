import { createMyketVerifier, type MyketConfig, type StoreIabVerifier } from './myket-iab';

/**
 * Myket configuration — env-only, mirroring `readZarinpalConfig` (the repository's established
 * pattern for a third-party credential): read server-side, never stored, never returned to a
 * browser. An unconfigured deployment has no Myket verify path, not a half-working one.
 */
export type MyketRuntimeConfig = MyketConfig;

type Environment = Record<string, string | undefined>;

export function readMyketConfig(environment: Environment = process.env): MyketRuntimeConfig | null {
  if (environment.LEARNBOX_MYKET_ENABLED !== 'true') return null;
  const accessToken = environment.MYKET_ACCESS_TOKEN ?? '';
  if (!accessToken) return null;
  const packageName = environment.MYKET_PACKAGE_NAME ?? 'ir.learnbox.app';
  return { accessToken, packageName };
}

export function myketVerifierFromEnvironment(
  environment: Environment = process.env,
): { verifier: StoreIabVerifier; config: MyketRuntimeConfig } | null {
  const config = readMyketConfig(environment);
  if (!config) return null;
  return { verifier: createMyketVerifier(config), config };
}
