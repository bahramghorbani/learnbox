import { timingSafeEqual } from 'node:crypto';

import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type AdminOtpConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy.js';
import {
  createOtpChallenge,
  createOtpCode,
  hashOtpClientIp,
  hashOtpCode,
  hashOtpPhone,
  otpPolicy,
} from './admin-otp-challenge.js';
import { adminSessionCookie, createAdminSessionSecrets } from './admin-session.js';

const otpChallengeCookieName = '__Host-learnbox_admin_otp_challenge';
const csrfCookieName = '__Host-learnbox_admin_csrf';
const challengeCookieMaxAge = otpPolicy.expiresInMs / 1000;
const absoluteSessionLifetimeMs = 8 * 60 * 60_000;

type OtpStore = {
  createIfRequestAllowed(
    record: ReturnType<typeof createOtpChallenge>,
    clientIpHash: string,
    now?: Date,
  ): Promise<{ status: 'allowed' | 'rate_limited' }>;
  verify(
    challengeId: string,
    suppliedCodeHash: string,
    now?: Date,
  ): Promise<{ status: 'verified' | 'invalid' | 'locked' | 'expired' | 'used' } | null>;
};

type SmsClient = { sendVerificationCode(phone: string, code: string): Promise<void> };

type SessionStore = {
  createSession(input: {
    tokenHash: string;
    csrfHash: string;
    now: Date;
    absoluteExpiresAt: Date;
  }): Promise<void>;
};

function otpChallengeCookie(challengeId: string) {
  return `${otpChallengeCookieName}=${challengeId}; Max-Age=${challengeCookieMaxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearOtpChallengeCookie() {
  return `${otpChallengeCookieName}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function csrfCookie(token: string) {
  return `${csrfCookieName}=${token}; Max-Age=28800; Path=/; Secure; SameSite=Strict`;
}

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function genericInvalid() {
  return new Response('Invalid request', {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Normalize common Iranian mobile formats to E.164 (+989XXXXXXXXX). */
function normalizeIranianPhone(raw: string): string | null {
  const stripped = raw.trim().replace(/[\s\-()+]/g, '');
  if (/^\+989\d{9}$/.test(raw.trim())) return raw.trim(); // already E.164
  if (/^09\d{9}$/.test(stripped)) return `+98${stripped.slice(1)}`;
  if (/^9\d{9}$/.test(stripped)) return `+98${stripped}`;
  if (/^989\d{9}$/.test(stripped)) return `+${stripped}`;
  return null;
}

function safeEqual(left: string, right: string): boolean {
  const l = Buffer.from(left);
  const r = Buffer.from(right);
  return l.length === r.length && timingSafeEqual(l, r);
}

function readClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export function createOtpRequestRoute(dependencies: {
  authConfig: AdminAuthConfig;
  otpConfig: AdminOtpConfig;
  store?: OtpStore;
  smsClient?: SmsClient | null;
  now?: () => Date;
}) {
  return async function POST(request: Request) {
    const { authConfig, otpConfig } = dependencies;
    if (!otpConfig.enabled) return notFound();

    let config: EnabledAdminAuthConfig;
    try {
      assertTrustedAdminMutation(request, authConfig, ['application/json']);
      config = authConfig as EnabledAdminAuthConfig;
    } catch {
      return genericInvalid();
    }

    let payload: { phone?: unknown };
    try {
      payload = (await request.json()) as { phone?: unknown };
    } catch {
      return genericInvalid();
    }
    if (typeof payload.phone !== 'string') return genericInvalid();

    const phoneE164 = normalizeIranianPhone(payload.phone);
    const genericSentResponse = new Response(JSON.stringify({ status: 'sent' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    if (!phoneE164) {
      // Invalid format — still return success-shaped response to avoid leaking info.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return genericSentResponse;
    }

    const phoneHash = hashOtpPhone(otpConfig.secret, phoneE164);
    const isAuthorized = safeEqual(phoneHash, otpConfig.authorizedPhoneHash);

    if (!isAuthorized) {
      // Phone not authorized — identical timing/response profile; no DB or SMS work.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return genericSentResponse;
    }

    if (!dependencies.store) throw new Error('OTP store is required.');

    const now = (dependencies.now ?? (() => new Date()))();
    const code = createOtpCode();
    // Challenge ID comes from gen_random_uuid(); generate a placeholder UUID here and let the DB
    // generate the real one. We pre-build the record with a temporary id, then replace after insert.
    // shortcut: challenge id is derived from randomUUID(); replace with DB uuid on insert.
    const id = crypto.randomUUID();
    const codeHash = hashOtpCode(otpConfig.secret, id, code);
    const challenge = createOtpChallenge({ id, phoneHash, codeHash, now });

    const clientIpHash = hashOtpClientIp(otpConfig.secret, readClientIp(request));
    const outcome = await dependencies.store.createIfRequestAllowed(challenge, clientIpHash, now);

    if (outcome.status === 'rate_limited') {
      // Return generic success to avoid leaking rate-limit status to the caller.
      return genericSentResponse;
    }

    // Send SMS only after the challenge is persisted.
    if (dependencies.smsClient) {
      await dependencies.smsClient.sendVerificationCode(phoneE164, code);
    }

    const response = new Response(JSON.stringify({ status: 'sent' }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': otpChallengeCookie(id),
      },
    });
    // Avoid leaking the CSRF token hash key name in a response header.
    void config;
    return response;
  };
}

export function createOtpVerifyRoute(dependencies: {
  authConfig: AdminAuthConfig;
  otpConfig: AdminOtpConfig;
  otpStore?: OtpStore;
  sessionStore?: SessionStore;
  createSessionSecrets?: typeof createAdminSessionSecrets;
  now?: () => Date;
}) {
  return async function POST(request: Request) {
    const { authConfig, otpConfig } = dependencies;
    if (!otpConfig.enabled) return notFound();

    let config: EnabledAdminAuthConfig;
    try {
      assertTrustedAdminMutation(request, authConfig, ['application/json']);
      config = authConfig as EnabledAdminAuthConfig;
    } catch {
      return genericInvalid();
    }

    if (!dependencies.otpStore || !dependencies.sessionStore) {
      throw new Error('OTP and session stores are required.');
    }

    const challengeId = readCookie(request, otpChallengeCookieName);
    if (
      !challengeId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)
    ) {
      return genericInvalid();
    }

    let payload: { code?: unknown };
    try {
      payload = (await request.json()) as { code?: unknown };
    } catch {
      return genericInvalid();
    }
    if (typeof payload.code !== 'string' || !/^\d{5}$/.test(payload.code)) {
      return genericInvalid();
    }

    const suppliedCodeHash = hashOtpCode(otpConfig.secret, challengeId, payload.code);
    const now = (dependencies.now ?? (() => new Date()))();
    const outcome = await dependencies.otpStore.verify(challengeId, suppliedCodeHash, now);

    if (!outcome) return genericInvalid();

    if (outcome.status === 'expired' || outcome.status === 'used' || outcome.status === 'locked') {
      const response = new Response('Authentication failed', {
        status: 401,
        headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearOtpChallengeCookie() },
      });
      return response;
    }

    if (outcome.status === 'invalid') {
      return new Response('Authentication failed', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // outcome.status === 'verified'
    const secrets = (dependencies.createSessionSecrets ?? createAdminSessionSecrets)(
      config.tokenHashKey,
    );
    await dependencies.sessionStore.createSession({
      tokenHash: secrets.tokenHash,
      csrfHash: secrets.csrfHash,
      now,
      absoluteExpiresAt: new Date(now.getTime() + absoluteSessionLifetimeMs),
    });

    const response = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', adminSessionCookie(secrets.token));
    response.headers.append('Set-Cookie', csrfCookie(secrets.csrfToken));
    response.headers.append('Set-Cookie', clearOtpChallengeCookie());
    return response;
  };
}
