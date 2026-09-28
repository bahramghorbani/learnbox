import { describe, expect, it } from 'vitest';

import { accountDeletionDependenciesFromEnvironment } from '../lib/account-deletion-runtime';

/**
 * Guards the wiring between account deletion and the OTP identity model (LB-B04).
 *
 * The deletion audit stores a one-way subject hash instead of the phone number, and a later
 * purchase-ownership claim is resolved by recomputing that hash from the phone the learner logs in
 * with. That only works while deletion hashes with the SAME secret the OTP flow uses. An earlier
 * revision read a variable name that exists nowhere in the deployment, which would have made every
 * deletion unavailable in production and, had it been defaulted instead, produced audit rows that
 * could never be matched to a returning learner.
 */

const VALID_DATABASE_URL = 'postgresql://user:pw@db.example.com/learnbox';
const VALID_SECRET = 'a'.repeat(64);

describe('account deletion runtime configuration', () => {
  it('uses the same secret variable the OTP flow hashes phone numbers with', () => {
    const dependencies = accountDeletionDependenciesFromEnvironment({
      DATABASE_URL: VALID_DATABASE_URL,
      LEARNBOX_OTP_SECRET: VALID_SECRET,
    });

    expect(dependencies).not.toBeNull();
  });

  it('is unavailable when the OTP secret is absent, rather than hashing with an empty secret', () => {
    const dependencies = accountDeletionDependenciesFromEnvironment({
      DATABASE_URL: VALID_DATABASE_URL,
    });

    expect(dependencies).toBeNull();
  });

  it('rejects a short secret instead of writing weakly-hashed audit rows', () => {
    const dependencies = accountDeletionDependenciesFromEnvironment({
      DATABASE_URL: VALID_DATABASE_URL,
      LEARNBOX_OTP_SECRET: 'too-short',
    });

    expect(dependencies).toBeNull();
  });

  it('is unavailable without a postgres database url', () => {
    expect(
      accountDeletionDependenciesFromEnvironment({
        DATABASE_URL: '',
        LEARNBOX_OTP_SECRET: VALID_SECRET,
      }),
    ).toBeNull();

    expect(
      accountDeletionDependenciesFromEnvironment({
        DATABASE_URL: 'mysql://user:pw@db.example.com/learnbox',
        LEARNBOX_OTP_SECRET: VALID_SECRET,
      }),
    ).toBeNull();
  });

  it('does not read any secret variable that the deployment never defines', () => {
    // Everything the production .env actually provides, minus the OTP secret.
    const dependencies = accountDeletionDependenciesFromEnvironment({
      DATABASE_URL: VALID_DATABASE_URL,
      LEARNBOX_SESSION_SECRET: VALID_SECRET,
      LEARNBOX_OTP_PHONE_HMAC_SECRET: VALID_SECRET,
    });

    // A stale variable name must not be able to satisfy the dependency check.
    expect(dependencies).toBeNull();
  });
});
