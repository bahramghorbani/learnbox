/**
 * LB-B29 route inventory.
 *
 * Every Next.js route that exports a state-changing method (anything but GET/HEAD/OPTIONS) must be
 * classified below. A new route that is not listed FAILS this test, so nobody can add a mutation
 * endpoint without deciding — in review, on purpose — how it defends against cross-site requests.
 *
 * Categories:
 *  - guarded:       cookie-authenticated; must run `guardMutation` BEFORE reading the session.
 *  - pre-login:     no session yet, but still a browser mutation; must run `guardMutation`.
 *  - bearer:        authenticated by an `Authorization: Bearer` token, never a cookie, so a
 *                   cross-site page cannot ride it. Must not read the session cookie at all.
 *  - hard-disabled: always 404 (or dev-only); must not read the request or the database.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const APP = join(ROOT, 'app');
const LIB = join(ROOT, 'lib');

type Category = 'guarded' | 'pre-login' | 'bearer' | 'hard-disabled';
interface Entry {
  category: Category;
  /** File that must contain the `guardMutation` call (guarded / pre-login). Defaults to the route. */
  guardIn?: string;
  /** Substring that marks where authentication / body reading starts, to prove the guard is first. */
  authMarker?: string;
}

const INVENTORY: Record<string, Entry> = {
  // cookie-authenticated
  'app/api/learner/reviews/route.ts': {
    category: 'guarded',
    guardIn: 'lib/learner-review-web-http.ts',
    authMarker: 'readSubject(request)',
  },
  'app/api/learner/account/route.ts': {
    category: 'guarded',
    guardIn: 'lib/account-deletion-http.ts',
    authMarker: 'readSubject(request)',
  },
  'app/api/learner/profile/update/route.ts': {
    category: 'guarded',
    authMarker: 'authenticateLearner(request)',
  },
  'app/api/auth/logout/route.ts': {
    category: 'guarded',
    authMarker: 'readLearnerSession(request)',
  },

  // pre-login and owner-only browser mutations
  'app/api/auth/otp/request/route.ts': { category: 'pre-login', guardIn: 'lib/otp-http.ts' },
  'app/api/auth/otp/verify/route.ts': { category: 'pre-login', guardIn: 'lib/otp-http.ts' },
  'app/api/auth/invite/check/route.ts': { category: 'pre-login', guardIn: 'lib/alpha-http.ts' },
  'app/api/owner/alpha-invite/route.ts': {
    category: 'pre-login',
    guardIn: 'lib/owner-invite-http.ts',
  },

  // Bearer-token API for the native/mobile client: no cookie, so no ambient credential to forge.
  'app/api/auth/mobile/otp/request/route.ts': { category: 'bearer' },
  'app/api/auth/mobile/otp/verify/route.ts': { category: 'bearer' },
  'app/api/auth/mobile/session/refresh/route.ts': { category: 'bearer' },
  'app/api/auth/mobile/session/revoke/route.ts': { category: 'bearer' },
  'app/api/reviews/mobile/route.ts': { category: 'bearer' },

  // Disabled for Web/PWA: answer 404 and touch nothing.
  'app/api/learner/reset-progress/route.ts': { category: 'hard-disabled' },
  'app/api/store/activate/route.ts': { category: 'hard-disabled' },
  'app/api/development-session/route.ts': { category: 'hard-disabled' },
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HTTP_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

const rel = (path: string) => relative(ROOT, path).split('\\').join('/');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** Methods a route file exports, however it spells the export. */
function exportedMethods(source: string): string[] {
  const methods = new Set<string>();
  for (const method of HTTP_METHODS) {
    const patterns = [
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
      new RegExp(`export\\s+(?:const|let|var)\\s+${method}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
    ];
    if (patterns.some((pattern) => pattern.test(source))) methods.add(method);
  }
  return [...methods];
}

const routeFiles = walk(APP)
  .filter((path) => /[\\/]route\.(ts|tsx|js|mjs)$/.test(path))
  .map(rel)
  .sort();

const mutating = routeFiles.filter((file) =>
  exportedMethods(read(file)).some((method) => !SAFE_METHODS.has(method)),
);

describe('mutation route inventory (LB-B29)', () => {
  it('finds the route files (guards against the scan silently matching nothing)', () => {
    expect(routeFiles.length).toBeGreaterThan(20);
    expect(mutating.length).toBeGreaterThanOrEqual(15);
  });

  it('classifies every route that exports a state-changing method', () => {
    const unclassified = mutating.filter((file) => !(file in INVENTORY));
    expect(
      unclassified,
      `New state-changing route(s) without a security classification: ${unclassified.join(', ')}.\n` +
        'Add each to INVENTORY in test/mutation-route-inventory.test.ts as guarded, pre-login, bearer\n' +
        'or hard-disabled, and call guardMutation() from lib/mutation-guard.ts for the first two.',
    ).toEqual([]);
  });

  it('has no stale inventory entry for a route that no longer mutates', () => {
    const stale = Object.keys(INVENTORY).filter((file) => !mutating.includes(file));
    expect(stale).toEqual([]);
  });

  it('does not use Next.js server actions, which would bypass this inventory', () => {
    const offenders = walk(APP)
      .filter((path) => /\.(ts|tsx|js|jsx)$/.test(path))
      .filter((path) => /^\s*['"]use server['"]/m.test(readFileSync(path, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  for (const [file, entry] of Object.entries(INVENTORY)) {
    describe(`${entry.category}: ${file}`, () => {
      if (entry.category === 'guarded' || entry.category === 'pre-login') {
        const guardFile = entry.guardIn ?? file;

        it('calls the shared guard', () => {
          expect(read(guardFile)).toMatch(
            /guardMutation\(request,\s*\{\s*method:\s*'(POST|PATCH|PUT|DELETE)'/,
          );
        });

        it('declares the same method the route exports', () => {
          const exported = exportedMethods(read(file)).filter((m) => !SAFE_METHODS.has(m));
          const declared = /guardMutation\(request,\s*\{\s*method:\s*'(\w+)'/.exec(
            read(guardFile),
          )?.[1];
          expect(exported).toEqual([declared]);
        });

        if (entry.category === 'guarded') {
          // Staging caught this: a handler-level guard is bypassed when the route file reads the
          // session (or short-circuits on a header) before delegating to that handler.
          it('runs the guard in the route file before any session read there', () => {
            const source = read(file);
            const authAt = source.search(/authenticateLearner\(|readLearnerSession\(/);
            if (authAt === -1) return;
            const guardAt = source.indexOf('guardMutation(request');
            expect(guardAt).toBeGreaterThan(-1);
            expect(guardAt).toBeLessThan(authAt);
          });
        }

        if (entry.authMarker) {
          it('runs the guard before authentication or body reading', () => {
            const source = read(guardFile);
            const guardAt = source.indexOf('guardMutation(request');
            const authAt = source.indexOf(entry.authMarker!);
            expect(guardAt).toBeGreaterThan(-1);
            expect(authAt).toBeGreaterThan(-1);
            expect(guardAt).toBeLessThan(authAt);
          });
        }
      }

      if (entry.category === 'bearer') {
        it('never reads or sets the session cookie', () => {
          const sources = [read(file)];
          for (const match of read(file).matchAll(
            /from '((?:\.\.?\/)[^']*(?:mobile|reviews)[^']*)'/g,
          )) {
            // Follow the relative import into lib/ to inspect the actual handler.
            const target = join(join(ROOT, file, '..'), match[1]);
            for (const ext of ['.ts', '.tsx']) {
              try {
                sources.push(readFileSync(target + ext, 'utf8'));
              } catch {
                /* not this extension */
              }
            }
          }
          const joined = sources.join('\n');
          expect(joined).not.toMatch(
            /learnbox_alpha_session|readLearnerSession|authenticateLearner|set-cookie/i,
          );
        });
      }

      if (entry.category === 'hard-disabled') {
        it('answers 404 (or is development-only) and never reads the request or a database', () => {
          const source = read(file);
          expect(source).toMatch(/404/);
          expect(source).not.toMatch(/request\.(json|formData|text|headers)/);
          expect(source).not.toMatch(/\bPool\b|DATABASE_URL/);
        });
      }
    });
  }

  it('lets only lib/mutation-guard.ts consult the Origin policy directly', () => {
    const offenders = [...walk(APP), ...walk(LIB)]
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .map(rel)
      .filter((file) => file !== 'lib/mutation-guard.ts' && file !== 'lib/trusted-origin.ts')
      .filter((file) =>
        /isTrustedRequestOrigin|isTrustedJsonMutation|isTrustedJsonPost/.test(read(file)),
      );
    expect(offenders).toEqual([]);
  });
});
