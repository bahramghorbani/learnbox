import { describe, expect, it } from 'vitest';

import {
  AVATARS,
  GENDER_VALUES,
  applyProfileUpdate,
  parseDateOfBirth,
  parseProfileUpdate,
} from '../lib/learner-profile-fields';

const today = new Date('2026-09-29T12:00:00Z');
const ok = (body: unknown) => {
  const parsed = parseProfileUpdate(body, today);
  if (!parsed.ok) throw new Error(`expected ok, got ${parsed.error}`);
  return parsed.update;
};
const err = (body: unknown) => {
  const parsed = parseProfileUpdate(body, today);
  return parsed.ok ? null : parsed.error;
};

describe('profile update parsing (LB-B28a)', () => {
  it('accepts every field individually; all are optional', () => {
    expect(ok({ firstName: ' سارا ' })).toEqual({ firstName: 'سارا' });
    expect(ok({ lastName: 'Ahmadi' })).toEqual({ lastName: 'Ahmadi' });
    expect(ok({ dateOfBirth: '1998-03-21' })).toEqual({ dateOfBirth: '1998-03-21' });
    expect(ok({ gender: 'prefer_not_to_say' })).toEqual({ gender: 'prefer_not_to_say' });
    expect(ok({ avatarId: 'bobo-focus' })).toEqual({ avatarId: 'bobo-focus' });
  });

  it('treats null and blank as CLEAR, and leaves absent keys out entirely', () => {
    expect(
      ok({ firstName: '', lastName: '   ', dateOfBirth: null, gender: '', avatarId: null }),
    ).toEqual({
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      gender: null,
      avatarId: null,
    });
    expect(Object.keys(ok({ gender: 'male' }))).toEqual(['gender']);
  });

  it('offers "prefer not to say" and rejects unknown genders', () => {
    expect(GENDER_VALUES).toContain('prefer_not_to_say');
    expect(err({ gender: 'x' })).toBe('invalid_gender');
  });

  it('never accepts phone or any identity/unknown field', () => {
    expect(err({ phone: '09121234567' })).toBe('unsupported_field');
    expect(err({ firstName: 'a', phone_e164: '+98912' })).toBe('unsupported_field');
    expect(err({ id: 'x' })).toBe('unsupported_field');
    expect(err({ age: 30 })).toBe('unsupported_field');
  });

  it('rejects empty and non-object bodies', () => {
    expect(err({})).toBe('empty_update');
    expect(err(null)).toBe('invalid_body');
    expect(err([])).toBe('invalid_body');
    expect(err('x')).toBe('invalid_body');
  });

  it('bounds and sanitises names', () => {
    expect(err({ firstName: 'x'.repeat(51) })).toBe('invalid_name');
    expect(err({ lastName: 'a\u0000b' })).toBe('invalid_name');
    expect(err({ firstName: 42 })).toBe('invalid_name');
    expect(ok({ firstName: 'x'.repeat(50) })).toEqual({ firstName: 'x'.repeat(50) });
  });

  it('accepts only real, past calendar dates', () => {
    expect(parseDateOfBirth('2000-02-29', today)).toBe('2000-02-29');
    expect(parseDateOfBirth('1999-02-29', today)).toBeUndefined();
    expect(parseDateOfBirth('2026-13-01', today)).toBeUndefined();
    expect(parseDateOfBirth('2026-09-30', today)).toBeUndefined();
    expect(parseDateOfBirth('2026-09-29', today)).toBe('2026-09-29');
    expect(parseDateOfBirth('1899-12-31', today)).toBeUndefined();
    expect(parseDateOfBirth('21/03/1998', today)).toBeUndefined();
    expect(err({ dateOfBirth: 19980321 })).toBe('invalid_date_of_birth');
  });

  it('accepts only avatars from the prebuilt allowlist (no URLs, no uploads)', () => {
    for (const avatar of AVATARS)
      expect(ok({ avatarId: avatar.id })).toEqual({ avatarId: avatar.id });
    expect(err({ avatarId: 'https://evil.example/x.png' })).toBe('invalid_avatar');
    expect(err({ avatarId: '../../etc/passwd' })).toBe('invalid_avatar');
    expect(err({ avatarId: 'bobo-nonexistent' })).toBe('invalid_avatar');
  });

  it('every avatar points at an existing public asset', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const avatar of AVATARS) {
      expect(existsSync(join(__dirname, '..', 'public', avatar.src))).toBe(true);
    }
  });
});

describe('profile update SQL building', () => {
  it('sets only the present keys, parameterised, with fixed column names', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const pool = {
      query: async (text: string, values: unknown[]) => {
        calls.push({ text, values });
        return {
          rows: [
            {
              first_name: 'A',
              last_name: null,
              date_of_birth: null,
              gender: null,
              avatar_id: null,
            },
          ],
        };
      },
    };
    await applyProfileUpdate(pool as never, 'user-1', {
      gender: 'male',
      lastName: "x'; DROP TABLE users;--",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/^UPDATE users SET last_name = \$1, gender = \$2 WHERE id = \$3/);
    expect(calls[0].text).not.toContain('DROP');
    expect(calls[0].values).toEqual(["x'; DROP TABLE users;--", 'male', 'user-1']);
  });
});
