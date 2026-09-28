import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '../app/api/health/route';
import { readHealthDependencies } from '../lib/health-runtime';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('health runtime dependencies', () => {
  it('registers no database probe when DATABASE_URL is absent', () => {
    expect(readHealthDependencies({})).toEqual([]);
  });

  it('ignores a non-postgres DATABASE_URL rather than probing it', () => {
    expect(readHealthDependencies({ DATABASE_URL: 'mysql://host/db' })).toEqual([]);
  });

  it('registers a database probe for a postgres URL', () => {
    const dependencies = readHealthDependencies({
      DATABASE_URL: 'postgresql://user:pw@host/db',
    });
    expect(dependencies.map((dependency) => dependency.name)).toEqual(['database']);
  });
});

describe('health route', () => {
  it('reports ok with no-store when there is nothing to probe', async () => {
    delete process.env.DATABASE_URL;
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = (await response.json()) as { status: string; dependencies: unknown[] };
    expect(body.status).toBe('ok');
    expect(body.dependencies).toEqual([]);
  });

  it('never exposes credentials or connection details to an anonymous caller', async () => {
    process.env.DATABASE_URL = 'postgresql://learnbox:supersecret@db.neon.tech/neondb';
    const response = await GET();
    const serialised = JSON.stringify(await response.json());

    for (const forbidden of ['supersecret', 'learnbox:', 'neon.tech', 'postgresql://']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('sets no cookies and never mutates session state', async () => {
    delete process.env.DATABASE_URL;
    const response = await GET();
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});
