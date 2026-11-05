import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const source = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('Admin #dictionary destination', () => {
  it('wires the #dictionary destination and its sidebar item', () => {
    const router = source('app/components/AdminWorkspaceRouter.tsx');
    const sidebar = source('app/components/AdminSidebar.tsx');
    expect(router).toContain("if (value === 'dictionary') return 'dictionary';");
    expect(router).toContain(
      "if (route === 'dictionary') return <DictionaryEditorialWorkspace />;",
    );
    expect(sidebar).toContain("{ label: 'واژه‌نامه', icon: 'dictionary', route: 'dictionary' }");
  });

  it('keeps the editor behind the guarded fetch/PATCH boundaries', () => {
    const workspace = source('app/components/DictionaryEditorialWorkspace.tsx');
    expect(workspace).toContain('fetch(`/api/dictionary/editorial?${params}`');
    expect(workspace).toContain('fetchWithStepUp(');
    expect(workspace).toContain('`/api/dictionary/editorial/${item.id}`');
    expect(workspace).toContain('response.status === 404');
    expect(workspace).toContain("setPhase('disabled')");
    // AI-first: an admin save is final, so an edit never sends an entry back to a queue.
    expect(workspace).not.toContain("status: 'queued'");
    expect(workspace).not.toContain('<textarea');
  });
});
