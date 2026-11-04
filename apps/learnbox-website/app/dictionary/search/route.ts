import { NextResponse } from 'next/server';
import { brief, dictionaryEnabled, search } from '../../../src/dictionary/store';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!dictionaryEnabled()) return new NextResponse(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  const words = params.get('words');
  // ?words=a,b,c -> short entries for the saved-words panel (words live only in the browser).
  if (words !== null)
    return NextResponse.json(brief(words.split(',').filter(Boolean)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  return NextResponse.json(search(params.get('q') ?? ''), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
