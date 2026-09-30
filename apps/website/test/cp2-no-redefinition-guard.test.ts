import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * LB-B35 CP2 — drift guard for the consistency boundary.
 *
 * Owner rule: no layer (Learner app, API, database projections, Admin) may independently redefine
 * Box, Learned, Mastered, Accuracy or the learning-day. The canonical definitions live ONLY in
 * packages/learning-engine/src/definitions.ts.
 *
 * This test scans production sources for the hand-written forms of those rules. The LEGACY list is the
 * complete set of pre-existing copies found by the CP0/CP2 audit; CP3 migrated each one and emptied
 * the list. The list may only shrink: a copy that is not listed — a new redefinition — fails
 * the build, and a listed copy that has already been removed also fails (so the list stays honest).
 */
const root = join(__dirname, '../../..');
const SCAN_DIRS = [
  'apps/website/app',
  'apps/website/lib',
  'apps/api/src',
  'apps/admin/app',
  'apps/admin/lib',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const PATTERNS: Array<{ rule: string; regex: RegExp }> = [
  { rule: 'box-threshold', regex: /stability_?[dD]ays\s*(?:<|>=)\s*(?:1|3|7|21)\b/ },
  { rule: 'state-as-learned', regex: /state\s*(?:=|IN)\s*(?:\(?\s*)'(?:review|mastered)'/ },
  { rule: 'grade-literal-set', regex: /'forgot'\s*,\s*'hard'\s*,\s*'remembered'\s*,\s*'mastered'/ },
  {
    rule: 'grade-literal-union',
    regex: /'forgot'\s*\|\s*'hard'\s*\|\s*'remembered'\s*\|\s*'mastered'/,
  },
  { rule: 'local-day-bucket', regex: /date_trunc\(\s*'day'/ },
];

/**
 * file → rules it is still allowed to violate.
 *
 * CP3 migrated every copy the CP0/CP2 audit found, so this list is EMPTY and must stay empty: a
 * hand-written Box threshold, learned-state predicate, grade set or day bucket anywhere in the
 * scanned sources now fails the build. (An entry may only be added with an owner-approved reason.)
 */
const LEGACY: Record<string, string[]> = {};

describe('LB-B35 CP2 — no independent redefinition of Box / Learned / Accuracy / grades / day', () => {
  const found: Record<string, string[]> = {};
  for (const dir of SCAN_DIRS) {
    let files: string[] = [];
    try {
      files = walk(join(root, dir));
    } catch {
      continue;
    }
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const rules = PATTERNS.filter(({ regex }) => regex.test(text)).map(({ rule }) => rule);
      if (rules.length) found[relative(root, file)] = rules;
    }
  }

  it('finds no redefinition outside the audited legacy list', () => {
    const unexpected: string[] = [];
    for (const [file, rules] of Object.entries(found)) {
      for (const rule of rules) {
        if (!(LEGACY[file] ?? []).includes(rule)) unexpected.push(`${file}: ${rule}`);
      }
    }
    expect(unexpected, 'new hand-written copy of a canonical learning rule').toEqual([]);
  });

  it('keeps the legacy list honest: every listed copy still exists', () => {
    const stale: string[] = [];
    for (const [file, rules] of Object.entries(LEGACY)) {
      for (const rule of rules) {
        if (!(found[file] ?? []).includes(rule)) stale.push(`${file}: ${rule}`);
      }
    }
    expect(stale, 'migrated already? remove it from LEGACY').toEqual([]);
  });

  it('scans Admin too (it must not gain its own copy before it consumes the canonical module)', () => {
    expect(Object.keys(found).filter((file) => file.startsWith('apps/admin/'))).toEqual([]);
  });
});
