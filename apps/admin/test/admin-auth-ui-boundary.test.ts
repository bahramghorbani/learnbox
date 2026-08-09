import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const componentsRoot = join(process.cwd(), 'app/components');

describe('admin passkey UI boundary', () => {
  it('uses same-origin passkey routes without browser credential storage or a prototype fallback', async () => {
    const source = await readFile(join(componentsRoot, 'PasskeySignIn.tsx'), 'utf8');

    expect(source).toContain("'/api/auth/login/options'");
    expect(source).toContain("'/api/auth/login/verify'");
    expect(source).toContain('startAuthentication');
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/prototype.*authenticated|authenticated.*prototype/i);
  });

  it('keeps the existing local workspace untouched while the public flag is disabled', async () => {
    const source = await readFile(join(componentsRoot, 'AdminAuthGate.tsx'), 'utf8');

    expect(source).toContain("mode === 'local-prototype'");
    expect(source).toContain("'/api/auth/session'");
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });
});
