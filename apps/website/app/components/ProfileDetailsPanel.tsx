'use client';

import Image from 'next/image';
import { type FormEvent, useEffect, useState } from 'react';

import {
  AVATARS,
  GENDER_VALUES,
  type Gender,
  type ProfileDetails,
} from '../../lib/learner-profile-fields';

/**
 * LB-B28a: optional profile fields. Everything here is optional and none of it gates any
 * learning flow; the panel only renders for a server-backed account. The server is the source
 * of truth: values are read from and written to /api/learner/profile/*, never kept locally.
 */

const genderLabel: Record<Gender, string> = {
  female: 'زن',
  male: 'مرد',
  other: 'سایر',
  prefer_not_to_say: 'ترجیح می‌دهم نگویم',
};

type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const empty: ProfileDetails = {
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  gender: null,
  avatarId: null,
};

export function ProfileDetailsPanel() {
  const [load, setLoad] = useState<LoadState>('loading');
  const [save, setSave] = useState<SaveState>('idle');
  const [values, setValues] = useState<ProfileDetails>(empty);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad('loading');
    fetch('/api/learner/profile/details', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { profile?: ProfileDetails };
        if (cancelled) return;
        setValues({ ...empty, ...body.profile });
        setLoad('ready');
      })
      .catch(() => {
        if (!cancelled) setLoad('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const set = <K extends keyof ProfileDetails>(key: K, value: ProfileDetails[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSave('idle');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSave('saving');
    try {
      const response = await fetch('/api/learner/profile/update', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: values.firstName?.trim() || null,
          lastName: values.lastName?.trim() || null,
          dateOfBirth: values.dateOfBirth || null,
          gender: values.gender,
          avatarId: values.avatarId,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { profile?: ProfileDetails };
      if (body.profile) setValues({ ...empty, ...body.profile });
      setSave('saved');
    } catch {
      setSave('error');
    }
  };

  return (
    <section className="profile-section" aria-labelledby="profile-details-title">
      <h2 id="profile-details-title">مشخصات شخصی</h2>
      <div className="profile-card">
        <p className="profile-card-note">
          همهٔ این موارد اختیاری‌اند و برای استفاده از LearnBox لازم نیستند. شمارهٔ موبایل همچنان
          شناسهٔ ورود شماست.
        </p>
        {load === 'loading' ? (
          <p className="profile-card-note" role="status">
            در حال بازیابی…
          </p>
        ) : null}
        {load === 'error' ? (
          <p className="profile-card-note" role="alert">
            بازیابی مشخصات ممکن نشد.
            <button
              className="text-button profile-identity-retry"
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              تلاش دوباره
            </button>
          </p>
        ) : null}
        {load === 'ready' ? (
          <form className="profile-details-form" onSubmit={submit} noValidate>
            <fieldset className="profile-avatar-set">
              <legend>آواتار</legend>
              <div className="profile-avatar-grid">
                {AVATARS.map((avatar) => (
                  <label key={avatar.id} className="profile-avatar-option">
                    <input
                      type="radio"
                      name="avatar"
                      value={avatar.id}
                      checked={values.avatarId === avatar.id}
                      onChange={() => set('avatarId', avatar.id)}
                    />
                    <Image src={avatar.src} alt={avatar.label} width={44} height={53} />
                  </label>
                ))}
              </div>
              {values.avatarId ? (
                <button className="text-button" type="button" onClick={() => set('avatarId', null)}>
                  حذف آواتار
                </button>
              ) : null}
            </fieldset>

            <label htmlFor="profile-first-name">نام</label>
            <input
              id="profile-first-name"
              autoComplete="given-name"
              maxLength={50}
              value={values.firstName ?? ''}
              onChange={(event) => set('firstName', event.target.value)}
            />

            <label htmlFor="profile-last-name">نام خانوادگی</label>
            <input
              id="profile-last-name"
              autoComplete="family-name"
              maxLength={50}
              value={values.lastName ?? ''}
              onChange={(event) => set('lastName', event.target.value)}
            />

            <label htmlFor="profile-dob">تاریخ تولد</label>
            <input
              id="profile-dob"
              type="date"
              dir="ltr"
              min="1900-01-01"
              max={new Date().toISOString().slice(0, 10)}
              autoComplete="bday"
              value={values.dateOfBirth ?? ''}
              onChange={(event) => set('dateOfBirth', event.target.value || null)}
            />
            <small className="profile-field-hint">
              تاریخ تولد ذخیره می‌شود، نه سن؛ سن در صورت نیاز از روی آن محاسبه می‌شود.
            </small>

            <label htmlFor="profile-gender">جنسیت</label>
            <select
              id="profile-gender"
              value={values.gender ?? ''}
              onChange={(event) => set('gender', (event.target.value as Gender) || null)}
            >
              <option value="">انتخاب نشده</option>
              {GENDER_VALUES.map((gender) => (
                <option key={gender} value={gender}>
                  {genderLabel[gender]}
                </option>
              ))}
            </select>

            <button className="primary-button" type="submit" disabled={save === 'saving'}>
              {save === 'saving' ? 'در حال ذخیره…' : 'ذخیره'}
            </button>
            {save === 'saved' ? (
              <p className="profile-card-note" role="status">
                ذخیره شد.
              </p>
            ) : null}
            {save === 'error' ? (
              <p className="auth-error" role="alert">
                ذخیره انجام نشد؛ دوباره تلاش کنید.
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </section>
  );
}
