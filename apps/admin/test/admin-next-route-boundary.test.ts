import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = join(process.cwd(), 'app/api/auth');
const splashRoot = join(process.cwd(), 'app/api/splash');

async function source(path: string) {
  return readFile(join(appRoot, path), 'utf8');
}

describe('admin Next.js passkey route boundary', () => {
  it('keeps login routes node-only, dynamic, and routed through the disabled-by-default server', async () => {
    for (const path of [
      'login/options/route.ts',
      'login/verify/route.ts',
      'session/route.ts',
      'logout/route.ts',
    ]) {
      const route = await source(path);
      expect(route).toContain("export const runtime = 'nodejs'");
      expect(route).toContain("export const dynamic = 'force-dynamic'");
      expect(route).toContain('getAdminAuthServer');
    }
  });

  it('keeps all private splash routes node-only, dynamic, and behind the splash server gate', async () => {
    for (const path of ['current/route.ts', 'preview/route.ts', 'replace/route.ts']) {
      const route = await readFile(join(splashRoot, path), 'utf8');
      expect(route).toContain("export const runtime = 'nodejs'");
      expect(route).toContain("export const dynamic = 'force-dynamic'");
      expect(route).toContain('getAdminSplashServer');
      expect(route).toContain("new Response('Not found', { status: 404 })");
    }
  });
});
