import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';

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
      require('node:fs').accessSync(candidate);
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
  _req: Request,
  context: { params: Promise<{ contentId: string; kind: string }> },
): Promise<NextResponse> {
  const { contentId, kind } = await context.params;

  if (!validContentId.test(contentId) || !validKinds.has(kind)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
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
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
