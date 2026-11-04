import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'apps/admin');
const source = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('Admin #dictionary destination', () => {
  it('wires the direct hash destination without modifying the frozen sidebar', () => {
    const router = source('app/components/AdminWorkspaceRouter.tsx');
    const sidebar = source('app/components/AdminSidebar.tsx');
    expect(router).toContain("if (value === 'dictionary') return 'dictionary';");
    expect(router).toContain("if (route === 'dictionary') return <DictionaryEditorialWorkspace />;");
    expect(sidebar).not.toContain('href="#dictionary"');
  });

  it('keeps the editor behind the guarded fetch/PATCH boundaries', () => {
    const workspace = source('app/components/DictionaryEditorialWorkspace.tsx');
    expect(workspace).toContain("fetch('/api/dictionary/editorial'");
    expect(workspace).toContain('fetchWithStepUp(');
    expect(workspace).toContain('`/api/dictionary/editorial/${selected.id}`');
    expect(workspace).toContain('response.status === 404');
    expect(workspace).toContain("setPhase('disabled')");
    expect(workspace).toContain("status: 'queued'");
  });
});
