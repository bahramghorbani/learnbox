/**
 * LB-B30 Admin route inventory. Every Admin route file that exports a state-changing method
 * (anything but GET/HEAD/OPTIONS) must be classified here. A new mutation route that is not listed
 * FAILS this test, so nobody can add an Admin endpoint without deciding how it defends against
 * cross-site requests and unauthenticated writes. Mirrors the learner app's LB-B29 inventory.
 *
 *  - guarded:        Origin + Content-Type guard first, then session, then per-session CSRF.
 *  - delegated:      the route delegates to a server module that must contain the guard.
 *  - hard-disabled:  legacy prototype route; the first statement is the production-proof 404 gate.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const API = join(ROOT, 'app', 'api');
const MUTATING = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g;

type Entry =
  | { category: 'guarded'; authMarker: string }
  | { category: 'delegated'; guardIn: string }
  | { category: 'hard-disabled' };

const INVENTORY: Record<string, Entry> = {
  'app/api/auth/add-passkey/verify/route.ts': {
    category: 'guarded',
    authMarker: 'loadAdminSession(',
  },
  'app/api/auth/bootstrap/verify/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-auth-routes.ts',
  },
  'app/api/auth/login/verify/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-auth-routes.ts',
  },
  'app/api/auth/logout/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-auth-routes.ts',
  },
  'app/api/auth/reauth/verify/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-auth-routes.ts',
  },
  'app/api/content/packs/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-packs-write-routes.ts',
  },
  'app/api/content/packs/[packId]/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-packs-write-routes.ts',
  },
  'app/api/content/packs/[packId]/cards/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-packs-write-routes.ts',
  },
  'app/api/content/cards/[cardId]/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-packs-write-routes.ts',
  },
  'app/api/content/import/preview/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-import-routes.ts',
  },
  'app/api/content/import/confirm/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-import-routes.ts',
  },
  // M1.4 — AI pack generation. Every route delegates the full guard chain (Origin, session, CSRF,
  // recent re-auth) to the shared route module, so an unauthenticated caller can never reach the
  // AI provider. `accept` is the only one that writes canonical data. The GET-only model
  // catalogue is classified under READ_ONLY below.
  'app/api/content/ai/plan/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-ai-generation-routes.ts',
  },
  'app/api/content/ai/plan/approve/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-ai-generation-routes.ts',
  },
  'app/api/content/ai/generate/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-ai-generation-routes.ts',
  },
  'app/api/content/ai/job/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-ai-generation-routes.ts',
  },
  'app/api/content/ai/accept/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-ai-generation-routes.ts',
  },
  // M1.5 — AI media generation. Same delegated guard chain. `generate` and `voice-preview` call
  // the provider; `accept` is the only one that changes which asset a card points at. The GET-only
  // catalogue, per-card state and protected asset reads are classified under READ_ONLY below.
  'app/api/content/media/generate/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-card-media-routes.ts',
  },
  'app/api/content/media/accept/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-card-media-routes.ts',
  },
  'app/api/content/lifecycle/submit-review/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-lifecycle-routes.ts',
  },
  'app/api/content/lifecycle/publish/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-lifecycle-routes.ts',
  },
  'app/api/content/lifecycle/archive/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-lifecycle-routes.ts',
  },
  'app/api/content/media/voice-preview/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-card-media-routes.ts',
  },
  'app/api/content/review/check/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-review-routes.ts',
  },
  'app/api/content/review/decision/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-content-review-routes.ts',
  },
  'app/api/splash/replace/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-splash-routes.ts',
  },
  // M2.1 — canonical Store listings. PUT delegates the full guard chain (Origin, session, CSRF,
  // recent re-auth, idempotency key) to the shared module, behind its own default-off
  // LEARNBOX_ADMIN_STORE_ENABLED gate. It writes `store_listings` only, never pack or card content.
  'app/api/store/listings/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-store-listing-routes.ts',
  },
  // M3.1 — account suspension. POST delegates the full guard chain (Origin, session, CSRF, recent
  // re-auth, idempotency key, required reason) to the shared module, behind its own default-off
  // LEARNBOX_ADMIN_SUPPORT_ENABLED gate. It writes `users.status`, the canonical session cutoff and
  // one audit entry — it cannot delete an account or erase learner data.
  'app/api/support/users/status/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-users-routes.ts',
  },
  // M3.2 — manual pack entitlements. POST (grant/revoke) delegates the same full guard chain to the
  // same shared module, behind the same default-off LEARNBOX_ADMIN_SUPPORT_ENABLED gate. It writes
  // one `user_packs` row and one audit entry; it can neither create nor alter a payment record, and
  // its revoke refuses an entitlement that came from a verified purchase. The file's GET is the
  // read-only support view of the same data.
  'app/api/support/users/packs/route.ts': {
    category: 'delegated',
    guardIn: 'lib/server/admin-users-routes.ts',
  },
  'app/api/banners/route.ts': { category: 'hard-disabled' },
  'app/api/gateways/route.ts': { category: 'hard-disabled' },
  'app/api/packs/route.ts': { category: 'hard-disabled' },
  'app/api/packs/generate/route.ts': { category: 'hard-disabled' },
  'app/api/packs/import/route.ts': { category: 'hard-disabled' },
  'app/api/users/[userId]/route.ts': { category: 'hard-disabled' },
};

/**
 * Routes with no mutating method. Each is either a hard-disabled legacy route (gate first, GET
 * included) or a read that goes through the shared server module/session layer.
 */
const READ_ONLY: Record<string, 'hard-disabled' | 'session-layer'> = {
  'app/api/users/route.ts': 'hard-disabled',
  // M3.1 support list: GET-only, so CSRF is not applicable; it still requires a valid Admin
  // session plus an operational role, and sits behind LEARNBOX_ADMIN_SUPPORT_ENABLED. It returns
  // canonical user rows and activity counters only — no learning content, no card history.
  'app/api/support/users/route.ts': 'session-layer',
  'app/api/transactions/route.ts': 'hard-disabled',
  'app/api/packs/csv-template/route.ts': 'hard-disabled',
  'app/api/auth/add-passkey/options/route.ts': 'session-layer',
  'app/api/auth/bootstrap/options/route.ts': 'session-layer',
  'app/api/auth/login/options/route.ts': 'session-layer',
  'app/api/auth/reauth/options/route.ts': 'session-layer',
  'app/api/auth/session/route.ts': 'session-layer',
  'app/api/content/import/template/route.ts': 'session-layer',
  'app/api/content/import/contract/route.ts': 'session-layer',
  'app/api/content/review/route.ts': 'session-layer',
  // M1.4 model catalogue: GET-only, so CSRF is not applicable; it still requires a valid Admin
  // session, and it returns model ids and the configured default only — never the credential.
  'app/api/content/ai/models/route.ts': 'session-layer',
  // M1.5 media reads: GET-only, so CSRF is not applicable; each still requires a valid Admin
  // session and recent re-auth. `asset` returns protected media bytes with `private, no-store`,
  // never on a public path.
  'app/api/content/media/models/route.ts': 'session-layer',
  'app/api/content/media/state/route.ts': 'session-layer',
  'app/api/content/media/asset/route.ts': 'session-layer',
  // M2.4 payment operations: GET-only, so CSRF is not applicable; each still requires a valid
  // Admin session plus an operational role, and both sit behind LEARNBOX_ADMIN_STORE_ENABLED.
  // `payment-config` returns flags, counts and timestamps only — never the merchant credential,
  // which the underlying store does not read at all. There is deliberately no write companion.
  'app/api/store/transactions/route.ts': 'session-layer',
  'app/api/store/payment-config/route.ts': 'session-layer',
  'app/api/content/lifecycle/route.ts': 'session-layer',
  'app/api/splash/current/route.ts': 'session-layer',
  'app/api/splash/preview/route.ts': 'session-layer',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name === 'route.ts' ? [full] : [];
  });
}
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const mutatingFiles = walk(API)
  .map((f) => relative(ROOT, f))
  .filter((rel) => new RegExp(MUTATING.source).test(read(rel)))
  .sort();

describe('Admin mutation route inventory (LB-B30)', () => {
  it('classifies every Admin route that exports a mutating method, and nothing else', () => {
    expect(mutatingFiles).toEqual(Object.keys(INVENTORY).sort());
  });

  it('runs the Origin/Content-Type guard BEFORE any session read in every guarded route', () => {
    for (const [file, entry] of Object.entries(INVENTORY)) {
      if (entry.category !== 'guarded') continue;
      const source = read(file);
      const guard = source.indexOf('guardAdminMutation(');
      const auth = source.indexOf(entry.authMarker);
      expect(guard, `${file} calls guardAdminMutation`).toBeGreaterThan(-1);
      expect(auth, `${file} reads the session`).toBeGreaterThan(-1);
      expect(guard, `${file}: guard must precede the session read`).toBeLessThan(auth);
      expect(source, `${file} checks the per-session CSRF token`).toContain('verifyAdminCsrf(');
    }
  });

  it('delegated routes point at a module that asserts Origin + Content-Type and the CSRF token', () => {
    for (const [file, entry] of Object.entries(INVENTORY)) {
      if (entry.category !== 'delegated') continue;
      const source = read(entry.guardIn);
      expect(source, `${entry.guardIn} for ${file}`).toContain('assertTrustedAdminMutation(');
    }
  });

  it('gates every MUTATING handler of a hard-disabled route as its FIRST statement', () => {
    const gate = 'const disabled = legacyAdminRouteGate(); if (disabled) return disabled;';
    for (const [file, entry] of Object.entries(INVENTORY)) {
      if (entry.category !== 'hard-disabled') continue;
      const source = read(file);
      const handlers = [
        ...source.matchAll(
          /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*(?::\s*\w+)?[^{]*\{/g,
        ),
      ];
      expect(handlers.length, `${file} exports a mutating handler`).toBeGreaterThan(0);
      for (const match of handlers) {
        const start = (match.index ?? 0) + match[0].length;
        const body = source
          .slice(start, start + 140)
          .replace(/\s+/g, ' ')
          .trim();
        expect(body.startsWith(gate), `${file} ${match[1]} must start with the legacy gate`).toBe(
          true,
        );
      }
    }
  });

  it('fully disables the legacy payment and template routes, GET included', () => {
    const gate = 'const disabled = legacyAdminRouteGate(); if (disabled) return disabled;';
    for (const file of [
      'app/api/gateways/route.ts',
      'app/api/transactions/route.ts',
      'app/api/banners/route.ts',
      'app/api/packs/csv-template/route.ts',
    ]) {
      const source = read(file);
      const handlers = [
        ...source.matchAll(
          /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b[^{]*\{/g,
        ),
      ];
      expect(handlers.length).toBeGreaterThan(0);
      for (const match of handlers) {
        const start = (match.index ?? 0) + match[0].length;
        const body = source
          .slice(start, start + 140)
          .replace(/\s+/g, ' ')
          .trim();
        expect(body.startsWith(gate), `${file} ${match[1]}`).toBe(true);
      }
    }
  });

  it('removes the reset_progress erase queries (hardcoded SQL DELETEs) from the source tree', () => {
    // The comment documenting the removal is okay; the actual SQL queries are forbidden.
    const offenders = walk(join(ROOT, 'app'))
      .concat(walk(join(ROOT, 'lib')))
      .filter((f) =>
        /DELETE FROM (review_events|card_schedules|user_streak)/.test(readFileSync(f, 'utf8')),
      );
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('classifies EVERY route file under app/api, whatever its methods', () => {
    const all = walk(API)
      .map((f) => relative(ROOT, f))
      .sort();
    expect(all).toEqual([...Object.keys(INVENTORY), ...Object.keys(READ_ONLY)].sort());
  });

  it('gates EVERY exported handler (GET included) of every hard-disabled route as its FIRST statement', () => {
    const gate = 'const disabled = legacyAdminRouteGate(); if (disabled) return disabled;';
    const disabledFiles = [
      ...Object.entries(INVENTORY)
        .filter(([, e]) => e.category === 'hard-disabled')
        .map(([f]) => f),
      ...Object.entries(READ_ONLY)
        .filter(([, c]) => c === 'hard-disabled')
        .map(([f]) => f),
      'app/api/gateways/route.ts',
      'app/api/banners/route.ts',
    ];
    for (const file of new Set(disabledFiles)) {
      const source = read(file);
      const handlers = [
        ...source.matchAll(
          /export\s+(?:async\s+)?function\s+(GET|HEAD|POST|PUT|PATCH|DELETE)\s*\([^)]*\)[^{]*\{/g,
        ),
      ];
      expect(handlers.length, `${file} exports handlers`).toBeGreaterThan(0);
      for (const match of handlers) {
        const start = (match.index ?? 0) + match[0].length;
        const body = source
          .slice(start, start + 140)
          .replace(/\s+/g, ' ')
          .trim();
        expect(body.startsWith(gate), `${file} ${match[1]} must start with the legacy gate`).toBe(
          true,
        );
      }
    }
  });

  it('routes that are not hard-disabled never carry raw legacy SQL against learner tables', () => {
    // Known, session-gated exception (deferred to the compatibility phase, LB-B31): the passkey
    // registration options route reads admin_owner/admin_passkey_credentials inline and issues a
    // WebAuthn challenge (a write) from a GET. It is authenticated and never touches learner data.
    const KNOWN_INLINE_SQL = new Set(['app/api/auth/add-passkey/options/route.ts']);
    for (const [file, category] of Object.entries(READ_ONLY)) {
      if (category !== 'session-layer' || KNOWN_INLINE_SQL.has(file)) continue;
      const source = read(file);
      expect(source, `${file} must not hold raw SQL`).not.toMatch(
        /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/,
      );
      expect(source, `${file} must not import pg directly`).not.toMatch(/from 'pg'/);
    }
  });
});
