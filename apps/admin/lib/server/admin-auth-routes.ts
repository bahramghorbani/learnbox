import { randomBytes } from 'node:crypto';

import {
  assertTrustedAdminMutation,
  readAdminBootstrapConfig,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { adminSessionCookie, createAdminSessionSecrets } from './admin-session';
import { clearAdminSessionCookie, loadAdminSession, verifyAdminCsrf } from './admin-route-security';

const ceremonyCookieName = '__Host-learnbox_admin_ceremony';
const csrfCookieName = '__Host-learnbox_admin_csrf';
const ceremonyLifetimeSeconds = 5 * 60;
const absoluteSessionLifetimeMs = 8 * 60 * 60_000;

type LoginService = {
  createLoginOptions(browserNonce: string): Promise<Record<string, unknown>>;
  verifyLogin(input: {
    browserNonce: string;
    response: { id: string; [key: string]: unknown };
  }): Promise<{ status: 'authenticated' | 'invalid' }>;
};

type SessionStore = {
  createSession(input: {
    tokenHash: string;
    csrfHash: string;
    now: Date;
    absoluteExpiresAt: Date;
  }): Promise<void>;
};

type ActiveSessionStore = {
  findActiveSession: Parameters<typeof loadAdminSession>[2]['findActiveSession'];
  touchSession: Parameters<typeof loadAdminSession>[2]['touchSession'];
};

type BootstrapService = {
  createBootstrapOptions(browserNonce: string): Promise<Record<string, unknown>>;
  verifyBootstrap(input: {
    browserNonce: string;
    secret: string;
    response: { id: string; [key: string]: unknown };
  }): Promise<{ status: 'bootstrapped' | 'invalid' }>;
};

type ReauthService = {
  createReauthOptions(browserNonce: string): Promise<Record<string, unknown>>;
  verifyReauth(input: {
    browserNonce: string;
    response: { id: string; [key: string]: unknown };
  }): Promise<{ status: 'reauthenticated' | 'invalid' }>;
};

function createOpaqueNonce() {
  return randomBytes(32).toString('base64url');
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

function ceremonyCookie(nonce: string) {
  return `${ceremonyCookieName}=${nonce}; Max-Age=${ceremonyLifetimeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function csrfCookie(token: string) {
  return `${csrfCookieName}=${token}; Max-Age=28800; Path=/; Secure; SameSite=Strict`;
}

function clearCeremonyCookie() {
  return `${ceremonyCookieName}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearCsrfCookie() {
  return `${csrfCookieName}=; Max-Age=0; Path=/; Secure; SameSite=Strict`;
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function genericInvalid() {
  return new Response('Invalid authentication request', {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createLoginOptionsRoute(dependencies: {
  config: AdminAuthConfig;
  randomNonce?: () => string;
  service?: Pick<LoginService, 'createLoginOptions'>;
}) {
  return async function GET(_request: Request) {
    void _request;
    if (!dependencies.config.enabled || !dependencies.service) return notFound();
    const nonce = (dependencies.randomNonce ?? createOpaqueNonce)();
    if (!/^[A-Za-z0-9_-]{40,}$/.test(nonce)) return notFound();

    try {
      const options = await dependencies.service.createLoginOptions(nonce);
      return Response.json(options, {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': ceremonyCookie(nonce),
        },
      });
    } catch {
      return new Response('Authentication unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

export function createLoginVerifyRoute(dependencies: {
  config: AdminAuthConfig;
  now?: () => Date;
  service?: Pick<LoginService, 'verifyLogin'>;
  sessionStore?: SessionStore;
  createSessionSecrets?: typeof createAdminSessionSecrets;
}) {
  return async function POST(request: Request) {
    if (!dependencies.config.enabled || !dependencies.service || !dependencies.sessionStore) {
      return notFound();
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return genericInvalid();
    }

    const nonce = readCookie(request, ceremonyCookieName);
    if (!nonce || !/^[A-Za-z0-9_-]{40,}$/.test(nonce)) return genericInvalid();

    let payload: { response?: { id?: unknown; [key: string]: unknown } };
    try {
      payload = (await request.json()) as { response?: { id?: unknown; [key: string]: unknown } };
    } catch {
      return genericInvalid();
    }
    if (!payload.response || typeof payload.response.id !== 'string') return genericInvalid();

    const result = await dependencies.service.verifyLogin({
      browserNonce: nonce,
      response: payload.response as { id: string; [key: string]: unknown },
    });
    if (result.status !== 'authenticated') return genericInvalid();

    const currentTime = (dependencies.now ?? (() => new Date()))();
    const secrets = (dependencies.createSessionSecrets ?? createAdminSessionSecrets)(
      config.tokenHashKey,
    );
    await dependencies.sessionStore.createSession({
      tokenHash: secrets.tokenHash,
      csrfHash: secrets.csrfHash,
      now: currentTime,
      absoluteExpiresAt: new Date(currentTime.getTime() + absoluteSessionLifetimeMs),
    });

    const response = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', adminSessionCookie(secrets.token));
    response.headers.append('Set-Cookie', csrfCookie(secrets.csrfToken));
    response.headers.append('Set-Cookie', clearCeremonyCookie());
    return response;
  };
}

export function createSessionRoute(dependencies: {
  config: AdminAuthConfig;
  sessionStore?: ActiveSessionStore;
  now?: () => Date;
}) {
  return async function GET(request: Request) {
    if (!dependencies.config.enabled || !dependencies.sessionStore) return notFound();
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return Response.json(
      { authenticated: true, recent: session.recent },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  };
}

export function createBootstrapOptionsRoute(dependencies: {
  config: AdminAuthConfig;
  environment: EnvironmentLike;
  randomNonce?: () => string;
  service?: Pick<BootstrapService, 'createBootstrapOptions'>;
}) {
  return async function GET(_request: Request) {
    void _request;
    const bootstrapConfig = readAdminBootstrapConfig(dependencies.environment);
    if (!dependencies.config.enabled || !bootstrapConfig.enabled || !dependencies.service) {
      return notFound();
    }
    const nonce = (dependencies.randomNonce ?? createOpaqueNonce)();
    if (!/^[A-Za-z0-9_-]{40,}$/.test(nonce)) return notFound();

    try {
      const options = await dependencies.service.createBootstrapOptions(nonce);
      return Response.json(options, {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': ceremonyCookie(nonce),
        },
      });
    } catch {
      return new Response('Authentication unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

export function createBootstrapVerifyRoute(dependencies: {
  config: AdminAuthConfig;
  environment: EnvironmentLike;
  service?: Pick<BootstrapService, 'verifyBootstrap'>;
}) {
  return async function POST(request: Request) {
    const bootstrapConfig = readAdminBootstrapConfig(dependencies.environment);
    if (!dependencies.config.enabled || !bootstrapConfig.enabled || !dependencies.service) {
      return notFound();
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return genericInvalid();
    }

    const nonce = readCookie(request, ceremonyCookieName);
    if (!nonce || !/^[A-Za-z0-9_-]{40,}$/.test(nonce)) return genericInvalid();

    let payload: {
      secret?: unknown;
      response?: { id?: unknown; [key: string]: unknown };
    };
    try {
      payload = (await request.json()) as {
        secret?: unknown;
        response?: { id?: unknown; [key: string]: unknown };
      };
    } catch {
      return genericInvalid();
    }
    if (
      typeof payload.secret !== 'string' ||
      !payload.response ||
      typeof payload.response.id !== 'string'
    ) {
      return genericInvalid();
    }

    const result = await dependencies.service.verifyBootstrap({
      browserNonce: nonce,
      secret: payload.secret,
      response: payload.response as { id: string; [key: string]: unknown },
    });
    if (result.status !== 'bootstrapped') return genericInvalid();

    const response = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', clearCeremonyCookie());
    return response;
  };
}

export function createReauthOptionsRoute(dependencies: {
  config: AdminAuthConfig;
  environment: EnvironmentLike;
  now?: () => Date;
  sessionStore?: ActiveSessionStore;
  randomNonce?: () => string;
  service?: Pick<ReauthService, 'createReauthOptions'>;
}) {
  return async function GET(request: Request) {
    if (!dependencies.config.enabled || !dependencies.service || !dependencies.sessionStore) {
      return notFound();
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(request, config, dependencies.sessionStore, currentTime);
    if (!session) return notFound();
    const nonce = (dependencies.randomNonce ?? createOpaqueNonce)();
    if (!/^[A-Za-z0-9_-]{40,}$/.test(nonce)) return notFound();

    try {
      const options = await dependencies.service.createReauthOptions(nonce);
      return Response.json(options, {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': ceremonyCookie(nonce),
        },
      });
    } catch {
      return new Response('Authentication unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

export function createReauthVerifyRoute(dependencies: {
  config: AdminAuthConfig;
  now?: () => Date;
  service?: Pick<ReauthService, 'verifyReauth'>;
  sessionStore?: ActiveSessionStore & {
    touchRecentAuthentication(tokenHash: string, now: Date): Promise<boolean>;
  };
}) {
  return async function POST(request: Request) {
    if (!dependencies.config.enabled || !dependencies.service || !dependencies.sessionStore) {
      return notFound();
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return genericInvalid();
    }

    const nonce = readCookie(request, ceremonyCookieName);
    if (!nonce || !/^[A-Za-z0-9_-]{40,}$/.test(nonce)) return genericInvalid();

    let payload: { response?: { id?: unknown; [key: string]: unknown } };
    try {
      payload = (await request.json()) as { response?: { id?: unknown; [key: string]: unknown } };
    } catch {
      return genericInvalid();
    }
    if (!payload.response || typeof payload.response.id !== 'string') return genericInvalid();

    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(request, config, dependencies.sessionStore, currentTime);
    if (!session) return genericInvalid();
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return genericInvalid();
    }

    const result = await dependencies.service.verifyReauth({
      browserNonce: nonce,
      response: payload.response as { id: string; [key: string]: unknown },
    });
    if (result.status !== 'reauthenticated') return genericInvalid();
    await dependencies.sessionStore.touchRecentAuthentication(session.tokenHash, currentTime);

    const response = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', clearCeremonyCookie());
    return response;
  };
}

type EnvironmentLike = Record<string, string | undefined>;

export function createLogoutRoute(dependencies: {
  config: AdminAuthConfig;
  sessionStore?: ActiveSessionStore & {
    revokeSession(tokenHash: string, now: Date): Promise<boolean>;
  };
  now?: () => Date;
}) {
  return async function POST(request: Request) {
    if (!dependencies.config.enabled || !dependencies.sessionStore) return notFound();
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return genericInvalid();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(request, config, dependencies.sessionStore, currentTime);
    if (!session) return genericInvalid();
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return genericInvalid();
    }
    await dependencies.sessionStore.revokeSession(session.tokenHash, currentTime);
    const response = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    response.headers.append('Set-Cookie', clearAdminSessionCookie());
    response.headers.append('Set-Cookie', clearCsrfCookie());
    return response;
  };
}
