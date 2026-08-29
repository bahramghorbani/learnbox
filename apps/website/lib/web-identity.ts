export type WebLearnerIdentityInput = Readonly<{
  phoneE164: string;
  phoneHash: string;
}>;

export type WebLearnerIdentityStore = Readonly<{
  resolveUserId(input: WebLearnerIdentityInput): Promise<string | null>;
}>;

export async function resolveWebLearnerIdentity(
  input: WebLearnerIdentityInput,
  store: WebLearnerIdentityStore,
): Promise<string | null> {
  if (!/^\+989\d{9}$/.test(input.phoneE164) || !/^[A-Za-z0-9_-]{16,128}$/.test(input.phoneHash)) {
    return null;
  }
  return store.resolveUserId(input);
}
