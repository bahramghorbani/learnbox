import type { Pool } from 'pg';

/**
 * LB-B28a: optional learner profile fields.
 *
 * Every field is optional. An ABSENT key leaves the stored value untouched; a key set to
 * null or an empty string CLEARS it. Phone is deliberately not editable here: it is the account
 * identity, so an unknown key (including `phone`) is rejected instead of silently ignored.
 */

export const GENDER_VALUES = ['female', 'male', 'other', 'prefer_not_to_say'] as const;
export type Gender = (typeof GENDER_VALUES)[number];

/** Prebuilt avatars: existing Bobo art only, so no new asset and no user-uploaded image. */
export const AVATARS = [
  { id: 'bobo-welcome', src: '/images/bobo/welcome-v2.png', label: 'بوبو خوش‌آمدگو' },
  { id: 'bobo-encourage', src: '/images/bobo/encourage-v2.png', label: 'بوبو مشوق' },
  { id: 'bobo-celebrate', src: '/images/bobo/celebrate-v2.png', label: 'بوبو شاد' },
  { id: 'bobo-focus', src: '/images/bobo/focus-v2.png', label: 'بوبو با تمرکز' },
  { id: 'bobo-recovery', src: '/images/bobo/recovery-v2.png', label: 'بوبو همراه' },
] as const;
export type AvatarId = (typeof AVATARS)[number]['id'];

export interface ProfileDetails {
  firstName: string | null;
  lastName: string | null;
  /** ISO calendar date (YYYY-MM-DD). Never an age. */
  dateOfBirth: string | null;
  gender: Gender | null;
  avatarId: AvatarId | null;
}

export type ProfileUpdate = Partial<ProfileDetails>;

export type ProfileError =
  | 'invalid_name'
  | 'invalid_date_of_birth'
  | 'invalid_gender'
  | 'invalid_avatar'
  | 'unsupported_field'
  | 'empty_update'
  | 'invalid_body';

export type ParsedProfileUpdate =
  { ok: true; update: ProfileUpdate } | { ok: false; error: ProfileError };

const MAX_NAME = 50;
const EARLIEST_DOB = '1900-01-01';
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const isBlank = (value: unknown): boolean =>
  value === null || (typeof value === 'string' && value.trim() === '');

function parseName(value: unknown): string | null | undefined {
  if (isBlank(value)) return null;
  if (typeof value !== 'string') return undefined;
  const name = value.trim();
  if (name.length > MAX_NAME || CONTROL_CHARS.test(name)) return undefined;
  return name;
}

/** A real calendar date, not in the future, not before 1900. */
export function parseDateOfBirth(value: string, today: Date = new Date()): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  const real =
    parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
  if (!real) return undefined;
  const todayIso = today.toISOString().slice(0, 10);
  if (value > todayIso || value < EARLIEST_DOB) return undefined;
  return value;
}

const FIELD_KEYS = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'avatarId'] as const;

export function parseProfileUpdate(body: unknown, today: Date = new Date()): ParsedProfileUpdate {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' };
  }
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.some((key) => !(FIELD_KEYS as readonly string[]).includes(key))) {
    return { ok: false, error: 'unsupported_field' };
  }
  if (keys.length === 0) return { ok: false, error: 'empty_update' };

  const update: ProfileUpdate = {};

  for (const key of ['firstName', 'lastName'] as const) {
    if (!(key in input)) continue;
    const name = parseName(input[key]);
    if (name === undefined) return { ok: false, error: 'invalid_name' };
    update[key] = name;
  }

  if ('dateOfBirth' in input) {
    const raw = input.dateOfBirth;
    if (isBlank(raw)) update.dateOfBirth = null;
    else {
      const dob = typeof raw === 'string' ? parseDateOfBirth(raw, today) : undefined;
      if (dob === undefined) return { ok: false, error: 'invalid_date_of_birth' };
      update.dateOfBirth = dob;
    }
  }

  if ('gender' in input) {
    const raw = input.gender;
    if (isBlank(raw)) update.gender = null;
    else if ((GENDER_VALUES as readonly unknown[]).includes(raw)) update.gender = raw as Gender;
    else return { ok: false, error: 'invalid_gender' };
  }

  if ('avatarId' in input) {
    const raw = input.avatarId;
    if (isBlank(raw)) update.avatarId = null;
    else if (AVATARS.some((avatar) => avatar.id === raw)) update.avatarId = raw as AvatarId;
    else return { ok: false, error: 'invalid_avatar' };
  }

  return { ok: true, update };
}

// Column names come from this fixed map, never from request input.
const COLUMN: Record<(typeof FIELD_KEYS)[number], string> = {
  firstName: 'first_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  gender: 'gender',
  avatarId: 'avatar_id',
};

const SELECT_DETAILS = `first_name, last_name, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
       gender, avatar_id`;

interface DetailsRow {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  avatar_id: AvatarId | null;
}

const toDetails = (row: DetailsRow): ProfileDetails => ({
  firstName: row.first_name,
  lastName: row.last_name,
  dateOfBirth: row.date_of_birth,
  gender: row.gender,
  avatarId: row.avatar_id,
});

export async function readProfileDetails(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<ProfileDetails | null> {
  const result = await pool.query<DetailsRow>(`SELECT ${SELECT_DETAILS} FROM users WHERE id = $1`, [
    userId,
  ]);
  return result.rows[0] ? toDetails(result.rows[0]) : null;
}

/** Applies only the keys present in `update`; returns the stored result, or null if no such user. */
export async function applyProfileUpdate(
  pool: Pick<Pool, 'query'>,
  userId: string,
  update: ProfileUpdate,
): Promise<ProfileDetails | null> {
  const keys = FIELD_KEYS.filter((key) => key in update);
  if (keys.length === 0) return readProfileDetails(pool, userId);
  const assignments = keys.map((key, index) => `${COLUMN[key]} = $${index + 1}`).join(', ');
  const values = keys.map((key) => update[key] ?? null);
  const result = await pool.query<DetailsRow>(
    `UPDATE users SET ${assignments} WHERE id = $${keys.length + 1} RETURNING ${SELECT_DETAILS}`,
    [...values, userId],
  );
  return result.rows[0] ? toDetails(result.rows[0]) : null;
}
