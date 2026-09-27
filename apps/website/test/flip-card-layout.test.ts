import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The 3D flip card renders two faces. The back overlays the front, but the FRONT
 * must stay in normal flow: when both faces were `position: absolute` inside a
 * fixed `min-height: 300px` container, the front was clipped by `overflow: hidden`
 * and the pronunciation button plus the tag row (~110px of content, including an
 * interactive control) were invisible and unreachable at every viewport size.
 *
 * These assertions lock the layout contract that keeps the front face growable.
 */
describe('flip card front face layout', () => {
  const css = readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

  function block(selector: string): string {
    // Match the LAST definition, since later rules win in the cascade.
    const matches = [...css.matchAll(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`, 'g'))];
    expect(matches.length, `expected a rule for ${selector}`).toBeGreaterThan(0);
    return matches[matches.length - 1][1];
  }

  it('does not absolutely position the shared card-face rule', () => {
    expect(block('.card-face')).not.toMatch(/position:\s*absolute/);
  });

  it('keeps the front face in normal flow so the card grows to fit content', () => {
    const front = block('.card-front');
    expect(front).toMatch(/position:\s*relative/);
    expect(front).not.toMatch(/position:\s*absolute/);
  });

  it('overlays the back face so the two faces still share one footprint', () => {
    const back = block('.card-back');
    expect(back).toMatch(/position:\s*absolute/);
    expect(back).toMatch(/inset:\s*0/);
    expect(back).toMatch(/rotateY\(180deg\)/);
  });

  it('uses min-height, not a fixed height, for the flip container', () => {
    const inner = block('.flip-inner');
    expect(inner).toMatch(/min-height:\s*300px/);
    expect(inner).not.toMatch(/(?<!min-)height:\s*\d+px/);
  });
});
