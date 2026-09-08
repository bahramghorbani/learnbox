export type WebLearnerProfileResult =
  { status: 'ok'; maskedPhone: string } | { status: 'unauthorized' } | { status: 'unavailable' };

const maskedIranianPhone = /^09\d{2}\*{3}\d{4}$/;

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
    if (
      typeof body !== 'object' ||
      body === null ||
      !maskedIranianPhone.test((body as { maskedPhone?: unknown }).maskedPhone as string)
    )
      return { status: 'unavailable' };
    return { status: 'ok', maskedPhone: (body as { maskedPhone: string }).maskedPhone };
  } catch {
    return { status: 'unavailable' };
  }
}
