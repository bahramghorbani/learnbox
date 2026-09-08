import type { LearnerProfile } from '../../api/dist/profile/learner-profile.service.js';

type BoundaryOptions = { development?: boolean };

export type WebLearnerProfileDependencies = {
  readLearnerProfile(userId: string): Promise<LearnerProfile | null>;
};

const headers = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

export async function handleWebLearnerProfileGet(
  request: Request,
  dependencies: WebLearnerProfileDependencies,
  readSubject: (request: Request) => string | null,
  options: BoundaryOptions = {},
): Promise<Response> {
  if (
    request.method !== 'GET' ||
    !isSecure(request, options.development ?? process.env.NODE_ENV === 'development')
  )
    return error('validation', 400);

  const subject = readSubject(request);
  if (!subject) return error('identityUnavailable', 401);

  try {
    const profile = await dependencies.readLearnerProfile(subject);
    return profile
      ? json({ maskedPhone: profile.maskedPhone }, 200)
      : error('identityUnavailable', 401);
  } catch {
    return error('serverUnavailable', 503);
  }
}

function isSecure(request: Request, development: boolean): boolean {
  const url = new URL(request.url);
  return (
    url.protocol === 'https:' ||
    (development &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname))
  );
}

function error(
  error: 'validation' | 'identityUnavailable' | 'serverUnavailable',
  status: number,
): Response {
  return json({ error }, status);
}

function json(body: Record<string, string>, status: number): Response {
  return Response.json(body, { status, headers });
}
