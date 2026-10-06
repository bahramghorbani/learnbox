import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { POST as storeActivate } from '../app/api/store/activate/route';
import { packAccessSql, storeCatalogueVisibilitySql } from '../lib/pack-access';

/**
 * M2.2 structural guard — the access rule stays single-sourced.
 *
 * The learner read paths are legitimately different queries (aggregate CTEs, LATERAL joins,
 * per-card lookups) that cannot share one SELECT, so what they share is the PREDICATE. Nothing
 * stops a future query from joining `packs` and forgetting the gate, which is exactly how an
 * authorization hole gets added by someone who never heard of this milestone — so the repository
 * asserts the property mechanically instead of relying on reviewer vigilance.
 */

const websiteDir = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(websiteDir, relative), 'utf8');

/** Every module whose queries return learner-facing pack or card content. */
const GUARDED_QUERY_MODULES = [
  'lib/learner-read-model.ts',
  'lib/learner-workload.ts',
  'lib/store-catalogue.ts',
  'app/api/learner/words/route.ts',
  'app/api/learner/cards/route.ts',
  'app/api/learner/today/route.ts',
];

describe('M2.2 access rule is single-sourced', () => {
  it.each(GUARDED_QUERY_MODULES)('%s derives its pack filter from pack-access', (relative) => {
    const source = read(relative);
    expect(source).toMatch(/from '[./]*(?:\.\.\/)*lib\/pack-access'|from '\.\/pack-access'/);
    expect(source).toMatch(/packAccessSql\(|curriculumCteSql\(/);
  });

  it.each(GUARDED_QUERY_MODULES)('%s hardcodes no rival pack-status filter', (relative) => {
    const source = read(relative);
    // `p.status = 'published'` written by hand is the exact shape of the old, entitlement-blind
    // rule. The one legitimate use is the Store CATALOGUE predicate, which lives in pack-access.
    expect(source).not.toMatch(/packs p ON p\.id = pc\.pack_id AND p\.status = 'published'/);
    expect(source).not.toMatch(/WHERE p\.status = 'published'\s*$/m);
  });

  it('keeps the media guard delegating rather than re-implementing the rule', () => {
    const source = read('lib/published-start-card.ts');
    expect(source).toMatch(/canLearnerAccessContentId/);
    // No second copy of the SQL: the module opens a pool and delegates the decision.
    expect(source).not.toMatch(/user_packs/);
    expect(source).not.toMatch(/status = 'published'/);
  });

  it.each([
    ['app/api/content-media/[contentId]/[kind]/route.ts', 'canLearnerAccessStartContentId'],
    ['app/api/private-media/[contentId]/[kind]/route.ts', 'canLearnerAccessStartContentId'],
  ])('%s authorizes protected bytes per learner', (relative, guard) => {
    const source = read(relative);
    expect(source).toContain(guard);
    expect(source).toContain('session.subject');
  });

  it('never lets a Store Listing enter the content-access rule', () => {
    // A listing is commercial presentation. If `store_listings` ever appears in the access
    // predicate, listing a pack would start granting content — the one thing M2.2 forbids.
    expect(packAccessSql('p', '$1')).not.toContain('store_listings');
    expect(packAccessSql('p', '$1')).toContain('user_packs');
    expect(packAccessSql('p', '$1')).toContain("status = 'published'");
    // Catalogue visibility is the only place listing state is consulted.
    expect(storeCatalogueVisibilitySql('p', 'sl')).toContain("sl.store_status = 'listed'");
    expect(storeCatalogueVisibilitySql('p', 'sl')).toContain("p.status = 'published'");
    expect(storeCatalogueVisibilitySql('p', 'sl')).not.toContain('user_packs');
  });

  it('binds the learner id as a parameter, never by interpolating a value', () => {
    // The alias and placeholder are code-supplied; the learner id itself is always bound.
    expect(packAccessSql('p', '$1')).toContain('$1::uuid');
    expect(packAccessSql('p', '$1')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('creates no entitlement rows anywhere in M2.2 (that is M2.3)', () => {
    for (const relative of [...GUARDED_QUERY_MODULES, 'lib/pack-access.ts']) {
      const source = read(relative);
      expect(source).not.toMatch(/INSERT\s+INTO\s+user_packs/i);
      expect(source).not.toMatch(/UPDATE\s+user_packs/i);
      expect(source).not.toMatch(/DELETE\s+FROM\s+user_packs/i);
    }
  });

  it('leaves POST /api/store/activate a 404 stub (M2.3)', async () => {
    const source = read('app/api/store/activate/route.ts');
    // The stub may export POST; what matters is that it grants nothing.
    expect(source).not.toMatch(/user_packs|INSERT|pack-access/);
    expect((await storeActivate()).status).toBe(404);
  });
});
