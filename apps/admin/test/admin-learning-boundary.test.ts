import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '../app/components/LearningWorkspace.tsx'), 'utf8');

describe('Stage 9 learning workspace boundary', () => {
  it('uses only the existing read-only dashboard aggregate', () => {
    expect(source).toContain("fetch('/api/dashboard/overview'");
    expect(source).not.toMatch(/fetch\(['"]\/api\/(?!dashboard\/overview)/);
  });

  it('does not import the engine or name protected learning storage/state', () => {
    expect(source).not.toContain('@learnbox/learning-engine');
    expect(source).not.toContain('packages/learning-engine');
    expect(source).not.toMatch(/card_schedules|date_trunc|leitner|mastered/);
  });
});
