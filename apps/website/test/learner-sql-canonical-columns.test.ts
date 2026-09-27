import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression guard for the staging Profile HTTP 500: the statistics query referenced
// `cv.cefr_level`, a column that does not exist on the canonical `card_versions` table
// (CEFR lives inside `content_json`). Unit tests run without a database, so the SQL text
// itself is checked against the canonical schema declared by the tracked migrations.
const websiteRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(websiteRoot, '../..');
const migrationsDir = path.join(repoRoot, 'database/migrations');

function canonicalColumns(table: string): Set<string> {
  const columns = new Set<string>();
  for (const file of fs.readdirSync(migrationsDir).sort()) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const create = new RegExp(
      `CREATE TABLE (?:IF NOT EXISTS )?${table} \\(([\\s\\S]*?)\\n\\);`,
      'i',
    );
    const createMatch = create.exec(sql);
    if (createMatch) {
      for (const rawLine of createMatch[1].split('\n')) {
        const line = rawLine.trim();
        const column = /^([a-z_][a-z0-9_]*)\s+[A-Za-z]/.exec(line);
        if (!column) continue;
        if (/^(primary|unique|foreign|check|constraint)$/i.test(column[1])) continue;
        columns.add(column[1]);
      }
    }
    const addColumn = new RegExp(
      `ALTER TABLE ${table}\\s+ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)`,
      'gi',
    );
    for (const match of sql.matchAll(addColumn)) columns.add(match[1]);
    const dropColumn = new RegExp(
      `ALTER TABLE ${table}\\s+DROP COLUMN (?:IF EXISTS )?([a-z_][a-z0-9_]*)`,
      'gi',
    );
    for (const match of sql.matchAll(dropColumn)) columns.delete(match[1]);
  }
  return columns;
}

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('canonical card_versions columns in API SQL', () => {
  const columns = canonicalColumns('card_versions');

  it('knows the canonical column set and excludes cefr_level', () => {
    expect(columns.has('content_json')).toBe(true);
    expect(columns.has('status')).toBe(true);
    expect(columns.has('cefr_level')).toBe(false);
  });

  it('never selects a non-canonical card_versions column', () => {
    const offenders: string[] = [];
    for (const file of routeFiles(path.join(websiteRoot, 'app/api'))) {
      const source = fs.readFileSync(file, 'utf8');
      if (!/card_versions/.test(source)) continue;
      const aliases = new Set<string>(['card_versions']);
      for (const match of source.matchAll(/card_versions\s+(?:AS\s+)?([a-z][a-z0-9_]*)/gi)) {
        if (!/^(on|where|using|join|as)$/i.test(match[1])) aliases.add(match[1]);
      }
      for (const alias of aliases) {
        const reference = new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)`, 'g');
        for (const match of source.matchAll(reference)) {
          if (!columns.has(match[1])) {
            offenders.push(`${path.relative(repoRoot, file)}: ${alias}.${match[1]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
