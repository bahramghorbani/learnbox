import { NextResponse } from 'next/server';
import { dictionaryEnabled, search } from '../../../src/dictionary/store';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!dictionaryEnabled()) return new NextResponse(null, { status: 404 });
  const q = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json(search(q), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
