import { NextResponse } from 'next/server';

import { createLearnerSession, learnerSessionCookie } from '../../../lib/server-session';

export const runtime = 'nodejs';

export async function POST() {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.LEARNBOX_ENABLE_DEVELOPMENT_SESSION !== 'true'
  ) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(learnerSessionCookie(createLearnerSession('development-learner')));
    return response;
  } catch {
    return new Response('Development session unavailable', { status: 503 });
  }
}
