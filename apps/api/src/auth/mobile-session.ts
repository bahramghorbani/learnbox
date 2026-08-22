import { createHmac, timingSafeEqual } from 'node:crypto';

export const mobileAccessTokenPolicy = { lifetimeMs: 15 * 60 * 1000, version: 1 } as const;

export type MobileSessionClock = Readonly<{ now(): Date }>;
export type MobileSessionRandom = Readonly<{ bytes(size: number): Uint8Array }>;
export type MobileAccessClaims = Readonly<{
  sub: string;
  sid: string;
  iat: number;
  exp: number;
  jti: string;
}>;
export type MobileAccessVerification =
  Readonly<{ status: 'valid'; claims: MobileAccessClaims }> | Readonly<{ status: 'invalid' }>;

type Dependencies = Readonly<{
  audience: string;
  clock: MobileSessionClock;
  key: string;
  random: MobileSessionRandom;
}>;
type AccessInput = Readonly<{ learnerId: string; sessionId: string; lifetimeMs?: number }>;

/** Pure native-token contract. Persistence and HTTP remain separate NI slices. */
export class MobileSessionContract {
  constructor(private readonly dependencies: Dependencies) {
    if (!dependencies.audience || !dependencies.key)
      throw new Error('Mobile session configuration is invalid.');
  }

  createAccessToken({
    learnerId,
    sessionId,
    lifetimeMs = mobileAccessTokenPolicy.lifetimeMs,
  }: AccessInput): string {
    if (
      !isOpaque(learnerId) ||
      !isOpaque(sessionId) ||
      !Number.isFinite(lifetimeMs) ||
      lifetimeMs < 0
    ) {
      throw new Error('Mobile access token input is invalid.');
    }
    const iat = epoch(this.dependencies.clock.now());
    const payload: MobileAccessClaims = Object.freeze({
      sub: learnerId,
      sid: sessionId,
      iat,
      exp: iat + Math.floor(lifetimeMs / 1000),
      jti: Buffer.from(this.dependencies.random.bytes(16)).toString('base64url'),
    });
    const encodedHeader = encode({
      v: mobileAccessTokenPolicy.version,
      aud: this.dependencies.audience,
    });
    const encodedPayload = encode(payload);
    return `${encodedHeader}.${encodedPayload}.${this.sign(`${encodedHeader}.${encodedPayload}`)}`;
  }

  verifyAccessToken(token: string): MobileAccessVerification {
    const [header, payload, signature, extra] = token.split('.');
    if (
      !header ||
      !payload ||
      !signature ||
      extra ||
      !safeEqual(signature, this.sign(`${header}.${payload}`))
    )
      return { status: 'invalid' };
    try {
      const meta = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as {
        v?: unknown;
        aud?: unknown;
      };
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as MobileAccessClaims;
      if (
        meta.v !== mobileAccessTokenPolicy.version ||
        meta.aud !== this.dependencies.audience ||
        !validClaims(claims) ||
        claims.exp <= epoch(this.dependencies.clock.now())
      )
        return { status: 'invalid' };
      return { status: 'valid', claims: Object.freeze({ ...claims }) };
    } catch {
      return { status: 'invalid' };
    }
  }

  createRefreshToken(): string {
    return Buffer.from(this.dependencies.random.bytes(32)).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Mobile refresh token is invalid.');
    return createHmac('sha256', this.dependencies.key)
      .update(`mobile-refresh:${token}`)
      .digest('base64url');
  }

  refreshTokenEquals(hash: string, token: string): boolean {
    return safeEqual(hash, this.hashRefreshToken(token));
  }

  private sign(value: string): string {
    return createHmac('sha256', this.dependencies.key).update(value).digest('base64url');
  }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function epoch(value: Date): number {
  const time = value.getTime();
  if (!Number.isFinite(time)) throw new Error('Mobile session time is invalid.');
  return Math.floor(time / 1000);
}
function isOpaque(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function validClaims(value: MobileAccessClaims): boolean {
  return (
    isOpaque(value.sub) &&
    isOpaque(value.sid) &&
    /^[A-Za-z0-9_-]{22}$/.test(value.jti) &&
    Number.isInteger(value.iat) &&
    Number.isInteger(value.exp) &&
    value.exp >= value.iat
  );
}
