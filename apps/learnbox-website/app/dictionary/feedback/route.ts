import { NextResponse } from 'next/server';
import {
  allow,
  feedbackEnabled,
  parseFeedback,
  recordFeedback,
} from '../../../src/dictionary/feedback';
import { dictionaryEnabled, getEntry } from '../../../src/dictionary/store';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  if (!dictionaryEnabled() || !feedbackEnabled())
    return new NextResponse(null, { status: 404, headers: noStore });
  const origin = request.headers.get('origin');
  if (
    origin &&
    origin !== new URL(request.url).origin &&
    origin !== process.env.NEXT_PUBLIC_SITE_URL
  )
    return new NextResponse(null, { status: 403, headers: noStore });
  const text = await request.text();
  if (text.length > 2000) return new NextResponse(null, { status: 413, headers: noStore });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400, headers: noStore });
  }
  const feedback = parseFeedback(body, (lemma) => getEntry(lemma) !== null);
  if (!feedback) return new NextResponse(null, { status: 400, headers: noStore });
  const who = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown';
  // Per-address limit plus a global ceiling, so a spoofed forwarded-for cannot flood the file.
  if (!allow(who) || !allow('*', Date.now(), 3000))
    return new NextResponse(null, { status: 429, headers: noStore });
  try {
    recordFeedback(feedback);
  } catch {
    return new NextResponse(null, { status: 503, headers: noStore });
  }
  return new NextResponse(null, { status: 204, headers: noStore });
}
