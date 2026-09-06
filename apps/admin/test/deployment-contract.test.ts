import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '..');
const repoRoot = resolve(appRoot, '../..');

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

  it('passes the public Passkey UI flag into Docker builds without exposing server secrets', async () => {
    const dockerfile = await readFile(
      resolve(repoRoot, 'infrastructure/production/admin/Dockerfile'),
      'utf8',
    );
    const compose = await readFile(
      resolve(repoRoot, 'infrastructure/production/admin/compose.yaml'),
      'utf8',
    );

    expect(dockerfile).toContain('ARG NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=false');
    expect(dockerfile).toContain(
      'ENV NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED=$NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED',
    );
    expect(compose).toContain(
      'NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED: ${NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED:-false}',
    );
    expect(dockerfile).not.toMatch(/ARG LEARNBOX_ADMIN_(TOKEN_HASH_KEY|BOOTSTRAP_SECRET)/);
  });
});
