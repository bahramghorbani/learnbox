import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveInviteGateMode } from '../app/alpha-invite-mode';

describe('invite gate mode', () => {
  it.each([
    [undefined, 'local-prototype'],
    ['false', 'local-prototype'],
    ['TRUE', 'local-prototype'],
    [' true', 'local-prototype'],
    ['true', 'server-invite'],
  ] as const)('selects %s as %s', (value, expectedMode) => {
    expect(resolveInviteGateMode(value)).toBe(expectedMode);
  });

  it('keeps the public invite UI flag disabled by default', () => {
    const example = readFileSync(resolve(process.cwd(), '../..', '.env.example'), 'utf8');

    expect(example).toContain('NEXT_PUBLIC_LEARNBOX_ALPHA_INVITE_UI_ENABLED=false');
  });
});
