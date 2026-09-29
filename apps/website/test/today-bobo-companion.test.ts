import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// LB-B25: Bobo is a motivational complement to the primary goal, not a standalone
// section. Structural guard on the component source (no DOM needed).
const src = readFileSync(join(__dirname, '..', 'app', 'components', 'TodayScreen.tsx'), 'utf8');

describe('Today screen: Bobo is a companion, not a section (LB-B25)', () => {
  it('renders Bobo exactly once', () => {
    expect(src.match(/<Bobo\b/g)).toHaveLength(1);
  });

  it('renders Bobo inside the goal card, before the tip card', () => {
    const goalCard = src.indexOf('className="goal-card"');
    const bobo = src.indexOf('<Bobo');
    const tipCard = src.indexOf('className="tip-card"');
    expect(goalCard).toBeGreaterThan(-1);
    expect(bobo).toBeGreaterThan(goalCard);
    expect(bobo).toBeLessThan(src.indexOf('className="quick-stats"'));
    expect(bobo).toBeLessThan(tipCard);
  });

  it('no longer uses the standalone 92px header Bobo wrapper', () => {
    expect(src).not.toContain('bobo-header');
    expect(src).toContain('bobo-companion');
  });

  it('keeps the motivational message as visible text, not only inside an image', () => {
    expect(src).toContain('goal-motive');
    expect(src).toContain('سلام! آماده‌ای شروع کنیم؟');
  });
});
