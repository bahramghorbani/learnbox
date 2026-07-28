import { createHmac, timingSafeEqual } from 'node:crypto';

const sessionCookieName = 'learnbox_alpha_session';
const sessionLifetimeSeconds = 60 * 60 * 8;
const tokenVersion = 'v1';

export type LearnerSession = {
  subject: string;
  expiresAt: number;
};

type SessionPayload = LearnerSession & {
  scope: 'learner';
};

function sessionSecret() {
  const secret = process.env.LEARNBOX_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
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

function validSubject(subject: unknown): subject is string {
  return typeof subject === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(subject);
}

export function createLearnerSession(subject: string, now = Date.now()) {
  if (!validSubject(subject)) throw new Error('Invalid learner session subject.');

  const secret = sessionSecret();
  if (!secret) throw new Error('LEARNBOX_SESSION_SECRET is not configured.');

  const payload: SessionPayload = {
    subject,
    scope: 'learner',
    expiresAt: Math.floor(now / 1000) + sessionLifetimeSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedPayload = `${tokenVersion}.${encodedPayload}`;
  return `${signedPayload}.${sign(signedPayload, secret)}`;
}

export function readLearnerSession(request: Request, now = Date.now()): LearnerSession | null {
  const secret = sessionSecret();
  const token = readCookie(request, sessionCookieName);
  if (!secret || !token) return null;

  const [version, encodedPayload, signature] = token.split('.');
  if (!version || !encodedPayload || !signature || version !== tokenVersion) return null;

  const signedPayload = `${version}.${encodedPayload}`;
  const expectedSignature = sign(signedPayload, secret);
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as SessionPayload;
    if (
      payload.scope !== 'learner' ||
      !validSubject(payload.subject) ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return { subject: payload.subject, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}

export function learnerSessionCookie(value: string) {
  return {
    name: sessionCookieName,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionLifetimeSeconds,
  };
}
