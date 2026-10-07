export type WebLearnerIdentityInput = Readonly<{
  phoneE164: string;
  phoneHash: string;
}>;

/**
 * Resolving a verified phone number to a learner has three answers, not two (M3.1).
 *
 * `suspended` exists so the sign-in door can say something true and specific. Folding it into
 * `rejected` would tell a suspended learner their correct OTP code was wrong, and folding it into
 * `ok` would mint a session that every subsequent request then refuses — a broken app instead of a
 * clear message.
 */
export type WebLearnerIdentityOutcome =
  | { readonly status: 'ok'; readonly userId: string }
  | { readonly status: 'suspended' }
  | { readonly status: 'rejected' };

export type WebLearnerIdentityStore = Readonly<{
  resolveUserId(input: WebLearnerIdentityInput): Promise<WebLearnerIdentityOutcome>;
}>;

export async function resolveWebLearnerIdentity(
  input: WebLearnerIdentityInput,
  store: WebLearnerIdentityStore,
): Promise<WebLearnerIdentityOutcome> {
  if (!/^\+989\d{9}$/.test(input.phoneE164) || !/^[A-Za-z0-9_-]{16,128}$/.test(input.phoneHash)) {
    return { status: 'rejected' };
  }
  return store.resolveUserId(input);
}
