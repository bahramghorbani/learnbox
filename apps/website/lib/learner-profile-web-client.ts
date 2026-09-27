export type WebLearnerProfileResult =
  { status: 'ok'; maskedPhone: string } | { status: 'unauthorized' } | { status: 'unavailable' };

const maskedIranianPhone = /^09\d{2}\*{3}\d{4}$/;

function isExactProfileResponse(value: unknown): value is { maskedPhone: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, 'maskedPhone') &&
    typeof (value as { maskedPhone?: unknown }).maskedPhone === 'string' &&
    maskedIranianPhone.test((value as { maskedPhone: string }).maskedPhone)
  );
}

export async function fetchWebLearnerProfile(
  fetchFn: typeof fetch = fetch,
): Promise<WebLearnerProfileResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/learner/profile', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (response.status !== 200)
    return response.status === 401 ? { status: 'unauthorized' } : { status: 'unavailable' };
  try {
    const body = (await response.json()) as unknown;
    if (!isExactProfileResponse(body)) return { status: 'unavailable' };
    return { status: 'ok', maskedPhone: body.maskedPhone };
  } catch {
    return { status: 'unavailable' };
  }
}
