import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '..');

describe('admin deployment contract', () => {
  it('uses an app-local Vercel config that cannot build the learner website', async () => {
    const source = await readFile(resolve(appRoot, 'vercel.json'), 'utf8');
    const config = JSON.parse(source) as Record<string, unknown>;

    expect(config.framework).toBe('nextjs');
    expect(config.installCommand).toBe('cd ../.. && pnpm install --frozen-lockfile');
    expect(config.buildCommand).toBe('cd ../.. && pnpm --filter @learnbox/admin build');
    expect(config.outputDirectory).toBe('.next');
    expect(source).not.toMatch(/apps\/website|@learnbox\/website/);
  });
});
