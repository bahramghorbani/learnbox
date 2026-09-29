import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// WCAG 2.5.8 (target size). This guards an ACCESSIBILITY property only. It makes no
// claim about LB-B23 (unintended card flip), which stays open until a reproduction
// identifies the mechanism.
const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} rule exists`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('audio button target size (accessibility, not a B23 fix)', () => {
  it('is at least 44x44 CSS px', () => {
    const block = rule('.audio-button');
    expect(block).toMatch(/min-height:\s*44px/);
    expect(block).toMatch(/min-width:\s*44px/);
  });
});
