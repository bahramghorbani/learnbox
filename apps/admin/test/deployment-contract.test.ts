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

  it('pins both public sign-in methods in the exact source commit without exposing server secrets', async () => {
    const dockerfile = await readFile(
      resolve(repoRoot, 'infrastructure/production/admin/Dockerfile'),
      'utf8',
    );
    const compose = await readFile(
      resolve(repoRoot, 'infrastructure/production/admin/compose.yaml'),
      'utf8',
    );
    const releaseBuild = await readFile(
      resolve(repoRoot, 'infrastructure/production/admin/release-build.env'),
      'utf8',
    );
    const buildScript = await readFile(
      resolve(repoRoot, 'infrastructure/production/admin/build-admin-image.sh'),
      'utf8',
    );

    for (const flag of [
      'NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED',
      'NEXT_PUBLIC_LEARNBOX_ADMIN_OTP_UI_ENABLED',
    ]) {
      expect(dockerfile).toContain(`ARG ${flag}=false`);
      expect(dockerfile).toContain(`ENV ${flag}=$${flag}`);
      expect(compose).toContain(`${flag}: \${${flag}:-false}`);
      expect(releaseBuild).toContain(`${flag}=true`);
    }
    expect(buildScript).toContain(
      'unset NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED NEXT_PUBLIC_LEARNBOX_ADMIN_OTP_UI_ENABLED',
    );
    expect(buildScript).toContain('git show "$SOURCE_SHA:$ADMIN_RELEASE_CONFIG"');
    expect(buildScript).not.toContain(
      'OTP_UI="${NEXT_PUBLIC_LEARNBOX_ADMIN_OTP_UI_ENABLED:-false}"',
    );
    expect(dockerfile).not.toMatch(/ARG LEARNBOX_ADMIN_(TOKEN_HASH_KEY|BOOTSTRAP_SECRET)/);
  });
});
