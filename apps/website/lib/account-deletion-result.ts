/**
 * Maps the `POST /api/learner/account` response to what the UI shows.
 *
 * 403 is ambiguous on the wire: the learner typed the wrong phone number
 * (`confirmationMismatch`), or the shared mutation guard refused the request
 * (`request_rejected`, LB-B29). Only the first is the learner's mistake, so the body decides —
 * telling someone their phone number is wrong when the request was refused would be a false
 * instruction.
 */
import type { AccountDeletionResult } from '../app/components/DeleteAccountPanel';

export async function accountDeletionResultFromResponse(
  response: Response,
): Promise<AccountDeletionResult> {
  if (response.ok) {
    const body = (await response.json().catch(() => ({}))) as { deletionId?: string };
    return { status: 'deleted', deletionId: body.deletionId ?? '' };
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error === 'confirmationMismatch'
      ? { status: 'mismatch' }
      : { status: 'unavailable' };
  }
  // 409 is a refusal to delete this account (privileged accounts are handled by support).
  if (response.status === 409) return { status: 'refused' };
  return { status: 'unavailable' };
}
