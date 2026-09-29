import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CP-8 finding: NEXT_PUBLIC_* is inlined at build time, so the production image built
// without this build arg silently hid the CP-7 profile-details panel on the phone.
const root = join(__dirname, '..', '..', '..', 'infrastructure', 'production', 'app');

describe('profile identity flag reaches the client bundle at build time', () => {
  it('Dockerfile declares the build arg before the website build', () => {
    const d = readFileSync(join(root, 'Dockerfile'), 'utf8');
    const arg = d.indexOf('ARG NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED');
    const env = d.indexOf('ENV NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED');
    const build = d.indexOf('pnpm --filter @learnbox/website build');
    expect(arg).toBeGreaterThan(-1);
    expect(env).toBeGreaterThan(arg);
    expect(build).toBeGreaterThan(env);
  });

  it('compose passes it as a build arg (release default: enabled)', () => {
    const c = readFileSync(join(root, 'compose.yaml'), 'utf8');
    expect(c).toMatch(
      /args:\s*\n\s+NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED: \$\{NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED:-true\}/,
    );
  });
});
