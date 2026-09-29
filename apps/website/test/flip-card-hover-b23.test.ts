import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// B23 regression: on iOS Safari :hover sticks after a tap. A `.card-face:hover`
// transform replaced `.card-back`'s rotateY(180deg), so the back face covered the
// front, taps on the audio buttons hit the flip container and flipped the card.
const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function rulesFor(selector: RegExp): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.split(',').some((s) => selector.test(s.trim()))) out.push(m[2]!);
  }
  return out;
}

describe('flip card faces keep their own transform stable (B23)', () => {
  it('no :hover/:active/:focus rule may set a transform on .card-face', () => {
    const rules = rulesFor(/^\.card-face(:hover|:active|:focus[\w-]*)/);
    expect(rules.filter((r) => /transform\s*:/.test(r))).toEqual([]);
  });

  it('.card-face itself carries no transform transition (only .flip-inner animates)', () => {
    const rules = rulesFor(/^\.card-face$/);
    expect(rules.filter((r) => /transition\s*:[^;]*transform/.test(r))).toEqual([]);
  });

  it('.card-back keeps rotateY(180deg) and .flip-inner is the only flipped transform', () => {
    expect(rulesFor(/^\.card-back$/).some((r) => /rotateY\(180deg\)/.test(r))).toBe(true);
    expect(rulesFor(/^\.flip-inner\.flipped$/).some((r) => /rotateY\(180deg\)/.test(r))).toBe(true);
  });
});
