import path from 'node:path';
import { accessSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { readLearnerSession } from '../../../../../lib/server-session';
import { isPublishedStartContentId } from '../../../../../lib/published-start-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validContentId = /^[a-z0-9-]+$/;
const validKinds = new Set(['image', 'word-audio', 'sentence-audio']);

function contentBase(): string {
  // In standalone mode, process.cwd() is /app/apps/website/
  // Content lives at /app/content/ (copied by Dockerfile)
  // Walk up from cwd to find the content directory
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'content', 'packs', 'learnbox-start');
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      dir = path.dirname(dir);
    }
  }
  // Fallback: absolute path for Docker production
  return '/app/content/packs/learnbox-start';
}

async function tryReadFile(candidates: string[]): Promise<{ data: Buffer; ext: string } | null> {
  for (const filePath of candidates) {
    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath).slice(1);
      return { data, ext };
    } catch {
      // not found — try next
    }
  }
  return null;
}

const mimeTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  mp3: 'audio/mpeg',
};

export async function GET(
  req: Request,
  context: { params: Promise<{ contentId: string; kind: string }> },
): Promise<NextResponse> {
  // SECURITY: vocabulary/card content is protected — requires valid authenticated session
  const session = readLearnerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'unauthorized' },
      {
        status: 401,
        headers: { 'cache-control': 'no-store', 'www-authenticate': 'Cookie' },
      },
    );
  }

  const { contentId, kind } = await context.params;

  if (!validContentId.test(contentId) || !validKinds.has(kind)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    if (!(await isPublishedStartContentId(contentId)))
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
  } catch {
    // Never expose a file when publication cannot be verified.
    return NextResponse.json(
      { error: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const base = contentBase();
  let candidates: string[];

  if (kind === 'image') {
    const imgDir = path.join(base, 'images');
    candidates = [
      path.join(imgDir, `${contentId}-image-v2.jpg`),
      path.join(imgDir, `${contentId}-image-v1.jpg`),
      path.join(imgDir, `${contentId}-image-v1.png`),
    ];
  } else {
    const suffix = kind === 'word-audio' ? 'word-audio' : 'sentence-audio';
    const audioDir = path.join(base, 'audio');
    candidates = [
      path.join(audioDir, `${contentId}-${suffix}-v2.mp3`),
      path.join(audioDir, `${contentId}-${suffix}-v1.mp3`),
    ];
  }

  const result = await tryReadFile(candidates);
  if (!result) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const contentType = mimeTypes[result.ext] ?? 'application/octet-stream';
  return new NextResponse(new Uint8Array(result.data), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Private: never cache publicly; authenticated per-request
      'Cache-Control': 'private, no-store',
    },
  });
}
