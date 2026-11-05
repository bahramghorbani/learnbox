// Publishing the public dictionary from Admin. The landing reads `current.json` in a shared
// directory and reopens the release file it names (ADR 0017: the landing never gets a database
// credential, only files). Publishing = build + verify a new file, then atomically swap the pointer.
// Rolling back = point back at the previous file. No database schema is involved.
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { buildRelease, type ReleaseReport, type ReleaseRow } from './dictionary-release-builder';

export type ReleaseRecord = {
  file: string;
  sha256: string;
  builtAt: string;
  /** When this release went live (a rollback re-activates an older build). */
  at: string;
  entries: number;
  added: number;
  changed: number;
  deleted: number;
  actor: string;
  kind: 'publish' | 'rollback' | 'initial';
};
export type ReleaseState = { current: ReleaseRecord | null; history: ReleaseRecord[] };

const fileName = /^dict-[0-9A-Za-z-]+\.sqlite$/;
const KEEP = 5;

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}
function writeAtomic(path: string, value: unknown) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  renameSync(tmp, path);
}

export class DictionaryReleasePublisher {
  constructor(
    private readonly dir: string,
    private readonly sqlite: typeof DatabaseSync,
  ) {}

  state(): ReleaseState {
    const current = readJson<ReleaseRecord | null>(join(this.dir, 'current.json'), null);
    const history = readJson<ReleaseRecord[]>(join(this.dir, 'history.json'), []);
    return { current: current && fileName.test(current.file) ? current : null, history };
  }

  /** Only one build at a time; a stale lock (crashed build) expires after 10 minutes. */
  private lock<T>(work: () => T): T | 'busy' {
    const path = join(this.dir, '.publish.lock');
    let fd: number;
    try {
      fd = openSync(path, 'wx');
    } catch {
      const since = readJson<{ at?: number }>(path, {}).at ?? 0;
      if (Date.now() - since < 600_000) return 'busy';
      rmSync(path, { force: true });
      fd = openSync(path, 'wx');
    }
    try {
      writeFileSync(fd, JSON.stringify({ at: Date.now() }));
      return work();
    } finally {
      closeSync(fd);
      rmSync(path, { force: true });
    }
  }

  private activate(record: ReleaseRecord) {
    const { current, history } = this.state();
    writeAtomic(join(this.dir, 'current.json'), record);
    writeAtomic(join(this.dir, 'history.json'), [record, ...history].slice(0, 20));
    // Keep the newest release files plus whatever the pointer and the previous release use.
    const keep = new Set([
      record.file,
      current?.file,
      ...history.slice(0, KEEP).map((h) => h.file),
    ]);
    for (const f of readdirSync(this.dir))
      if (fileName.test(f) && !keep.has(f)) rmSync(join(this.dir, f), { force: true });
  }

  publish(
    rows: ReleaseRow[],
    actor: string,
    now: Date,
  ):
    | { status: 'published'; report: ReleaseReport }
    | { status: 'failed'; report: ReleaseReport }
    | { status: 'busy' }
    | { status: 'unconfigured' } {
    const { current } = this.state();
    if (!current || !existsSync(join(this.dir, current.file))) return { status: 'unconfigured' };
    const result = this.lock(() => {
      const builtAt = now.toISOString();
      const file = `dict-${builtAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.sqlite`;
      const outPath = join(this.dir, file);
      const report = buildRelease({
        sqlite: this.sqlite,
        basePath: join(this.dir, current.file),
        outPath,
        rows,
        builtAt,
      });
      if (!report.ok) {
        rmSync(outPath, { force: true });
        return { status: 'failed' as const, report };
      }
      this.activate({
        file,
        sha256: report.sha256,
        builtAt,
        at: builtAt,
        entries: report.entries,
        added: report.added,
        changed: report.changed,
        deleted: report.deleted,
        actor,
        kind: 'publish',
      });
      return { status: 'published' as const, report };
    });
    return result === 'busy' ? { status: 'busy' } : result;
  }

  /** Point the site back at the release that was live before the current one. */
  rollback(
    actor: string,
    now: Date,
  ): { status: 'rolled-back'; record: ReleaseRecord } | { status: 'none' } | { status: 'busy' } {
    const result = this.lock(() => {
      const { current, history } = this.state();
      const previous = history.find(
        (h) => h.file !== current?.file && existsSync(join(this.dir, basename(h.file))),
      );
      if (!previous) return { status: 'none' as const };
      const record = { ...previous, at: now.toISOString(), actor, kind: 'rollback' as const };
      this.activate(record);
      return { status: 'rolled-back' as const, record };
    });
    return result === 'busy' ? { status: 'busy' } : result;
  }
}
