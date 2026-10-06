import { createZarinpalProvider, type ZarinpalProvider } from './zarinpal';

/**
 * Zarinpal configuration (Phase 2 / M2.4).
 *
 * Deliberately env-only, mirroring `readOtpRuntimeConfig` for SMS.ir — the repository's established
 * pattern for a third-party credential. The merchant id is read server-side, is never written to
 * the database, never returned to a browser and never logged. There is no Admin write path for it:
 * see `describeZarinpalConfiguration` below.
 *
 * `readZarinpalConfig` returns null when payment is not configured, exactly as the OTP runtime
 * does, so an unconfigured deployment simply has no paid flow rather than a half-working one.
 */

export type ZarinpalConfig = {
  merchantId: string;
  sandbox: boolean;
  /** Absolute https origin the gateway returns the learner to. */
  callbackOrigin: string;
};

type Environment = Record<string, string | undefined>;

/**
 * Zarinpal merchant ids are UUIDs (36 characters with dashes).
 *
 * Validated so a placeholder like "changeme" or a pasted-in fragment fails configuration rather
 * than producing live payment attempts that are rejected one at a time.
 */
const merchantIdPattern =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isZarinpalMerchantId(value: unknown): value is string {
  return typeof value === 'string' && merchantIdPattern.test(value);
}

/** The callback must be an absolute https origin: the gateway will not return to a relative path. */
function readCallbackOrigin(environment: Environment): string | null {
  const raw = environment.LEARNBOX_PUBLIC_APP_ORIGIN ?? '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readZarinpalConfig(environment: Environment = process.env): ZarinpalConfig | null {
  if (environment.LEARNBOX_ZARINPAL_ENABLED !== 'true') return null;
  const merchantId = environment.ZARINPAL_MERCHANT_ID ?? '';
  if (!isZarinpalMerchantId(merchantId)) return null;
  const callbackOrigin = readCallbackOrigin(environment);
  if (!callbackOrigin) return null;
  return {
    merchantId,
    // Opt OUT of sandbox explicitly. An unset or malformed flag means sandbox, so a configuration
    // mistake cannot silently take real money.
    sandbox: environment.ZARINPAL_SANDBOX !== 'false',
    callbackOrigin,
  };
}

export function zarinpalProviderFromEnvironment(
  environment: Environment = process.env,
): { provider: ZarinpalProvider; config: ZarinpalConfig } | null {
  const config = readZarinpalConfig(environment);
  if (!config) return null;
  return {
    provider: createZarinpalProvider({ merchantId: config.merchantId, sandbox: config.sandbox }),
    config,
  };
}

/** Which of the gateway's prerequisites are satisfied — never the values themselves. */
export type ZarinpalConfigurationStatus = {
  state: 'disabled' | 'incomplete' | 'ready';
  enabled: boolean;
  merchantIdPresent: boolean;
  merchantIdValid: boolean;
  /** Last four characters only: enough to tell two credentials apart, useless to an attacker. */
  merchantIdHint: string | null;
  environment: 'sandbox' | 'production' | null;
  callbackOriginConfigured: boolean;
  /** What is still missing, as field names — never values. */
  missing: string[];
};

/**
 * The Admin-facing view of payment configuration.
 *
 * Returns STATUS ONLY. There is no Admin write path for the merchant id, and this is a deliberate
 * decision rather than an omission: the repository keeps third-party credentials in server
 * environment variables (SMS.ir, the database URL, object storage). Accepting the merchant id
 * through an Admin form would mean either storing a live payment credential in a plaintext
 * application table or introducing an encrypted-secrets subsystem with its own key management,
 * rotation and audit story. Both are larger and weaker than the pattern already in use, so Admin
 * reports configuration state and the secret is provisioned server-side.
 *
 * `merchantIdHint` is the last four characters. Enough for an operator to confirm WHICH credential
 * is deployed; not enough to reconstruct it.
 */
export function describeZarinpalConfiguration(
  environment: Environment = process.env,
): ZarinpalConfigurationStatus {
  const enabled = environment.LEARNBOX_ZARINPAL_ENABLED === 'true';
  const rawMerchantId = environment.ZARINPAL_MERCHANT_ID ?? '';
  const merchantIdPresent = rawMerchantId.trim().length > 0;
  const merchantIdValid = isZarinpalMerchantId(rawMerchantId);
  const callbackOrigin = readCallbackOrigin(environment);

  const missing: string[] = [];
  if (!enabled) missing.push('LEARNBOX_ZARINPAL_ENABLED');
  if (!merchantIdValid) missing.push('ZARINPAL_MERCHANT_ID');
  if (!callbackOrigin) missing.push('LEARNBOX_PUBLIC_APP_ORIGIN');

  const state: ZarinpalConfigurationStatus['state'] = !enabled
    ? 'disabled'
    : missing.length === 0
      ? 'ready'
      : 'incomplete';

  return {
    state,
    enabled,
    merchantIdPresent,
    merchantIdValid,
    merchantIdHint: merchantIdValid ? rawMerchantId.slice(-4) : null,
    environment: enabled
      ? environment.ZARINPAL_SANDBOX !== 'false'
        ? 'sandbox'
        : 'production'
      : null,
    callbackOriginConfigured: callbackOrigin !== null,
    missing,
  };
}
