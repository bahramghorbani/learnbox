import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Stage 2 authorizes read-only metrics and explicitly forbids a migration. That makes one thing
 * non-negotiable: every table the Dashboard store reads must ALREADY be SELECT-granted to
 * `learnbox_admin`. A dashboard that needs a new grant is not a read-only change — it is a
 * privilege change wearing a chart.
 *
 * This runs without a database on purpose. The role-grant DB tests need a provisioned restricted
 * role and skip in CI, which is exactly where a missing grant would slip through; parsing the
 * committed grant SQL catches it on every run. Adding a table to the store's SQL without its grant
 * fails here before it can fail in Production with a 503.
 */

const repoRoot = path.resolve(__dirname, '../../..');
const storePath = path.join(repoRoot, 'apps/admin/lib/server/postgres-admin-dashboard-store.ts');

/** Grant sources, in the order they were applied to Production. */
const grantSources = [
  'infrastructure/database/db-roles-p0.sql',
  'database/migrations/0028_user_account_status.sql',
  'database/migrations/0029_support_pack_entitlements.sql',
  'database/migrations/0032_role_grant_repair.sql',
  'database/migrations/0033_admin_content_management_grants.sql',
  'database/migrations/0034_admin_pack_metadata_grants.sql',
];

function readIfPresent(relative: string): string {
  try {
    return readFileSync(path.join(repoRoot, relative), 'utf8');
  } catch {
    return '';
  }
}

/** Table names from every `GRANT ... SELECT ... ON <tables> TO ... learnbox_admin` statement. */
function selectGrantedTables(): Set<string> {
  const granted = new Set<string>();
  const sql = grantSources.map(readIfPresent).join('\n');
  const statements = sql.match(/GRANT[\s\S]*?;/gi) ?? [];
  for (const statement of statements) {
    const [, privileges, tables] =
      statement.match(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s/i) ?? [];
    if (!privileges || !tables) continue;
    if (!/\bSELECT\b/i.test(privileges)) continue;
    if (!/learnbox_admin/i.test(statement)) continue;
    for (const table of tables.split(',')) {
      const name = table.trim().replace(/^public\./, '');
      if (/^[a-z_][a-z0-9_]*$/.test(name)) granted.add(name);
    }
  }
  return granted;
}

/** Only the SQL — the template literals — so prose in comments cannot be mistaken for a table. */
function storeSql(): string[] {
  const source = readFileSync(storePath, 'utf8');
  return [...source.matchAll(/`([^`]*)`/g)]
    .map((match) => match[1])
    .filter((literal) => /\bSELECT\b/.test(literal));
}

/** Table names the store actually reads, taken from its own SQL. */
function tablesReadByStore(): Set<string> {
  const tables = new Set<string>();
  for (const literal of storeSql()) {
    for (const match of literal.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/g)) {
      const name = match[1];
      // CTE names are defined in the same statement and are not tables.
      if (['learner', 'active', 'pack', 'queue'].includes(name)) continue;
      tables.add(name);
    }
  }
  return tables;
}

describe('dashboard store privileges', () => {
  it('reads only tables already SELECT-granted to learnbox_admin', () => {
    const granted = selectGrantedTables();
    const read = [...tablesReadByStore()].sort();
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter((table) => !granted.has(table))).toEqual([]);
  });

  it('covers the tables the dashboard metrics are defined on', () => {
    const read = tablesReadByStore();
    for (const table of [
      'users',
      'review_events',
      'packs',
      'pack_cards',
      'card_versions',
      'purchase_events',
      'audit_logs',
    ]) {
      expect(read.has(table)).toBe(true);
    }
  });

  /**
   * LB-B35 CP2: no layer outside the learning engine may name or redefine a scheduler state or the
   * learning-day. The repo-wide guard lives in `apps/website/test/cp2-no-redefinition-guard.test.ts`;
   * this keeps the dashboard store honest where the temptation is strongest, because an overview is
   * exactly where someone would reach for a progress distribution.
   */
  it('holds no learning rule: no scheduler state and no hand-written day bucket', () => {
    const source = readFileSync(storePath, 'utf8');
    const sql = storeSql().join('\n');
    expect(sql).not.toMatch(/\bcard_schedules\b/);
    expect(sql).not.toMatch(/date_trunc/);
    expect(source).not.toMatch(/@learnbox\/learning-engine/);
    expect(source.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')).not.toMatch(
      /streak|mastered|leitner|stability_days/i,
    );
  });

  it('issues no write statement', () => {
    for (const literal of storeSql()) {
      for (const verb of [
        'INSERT INTO',
        'UPDATE ',
        'DELETE FROM',
        'CREATE ',
        'ALTER ',
        'DROP ',
        'TRUNCATE',
        'GRANT ',
      ]) {
        expect(literal.includes(verb)).toBe(false);
      }
    }
  });

  it('bounds every list query', () => {
    const unbounded = storeSql().filter(
      (literal) =>
        !/count\(|sum\(|LIMIT\s+\d+/i.test(literal) &&
        !literal.includes('FROM admin_role_assignments'),
    );
    expect(unbounded).toEqual([]);
  });
});
