import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ contentId: string; kind: string }>;
};

// Issue #59: word audio must be the exact displayed German phrase, including
// the article (e.g. `das Haus`). The V1 clips spoke the bare lemma; the V2
// clips (regenerated with the article) are the linguistically approved source.
const mediaKinds = {
  image: { suffix: '-image-v1.png', directory: 'images', contentType: 'image/png' },
  'word-audio': { suffix: '-word-audio-v2.mp3', directory: 'audio', contentType: 'audio/mpeg' },
  'sentence-audio': {
    suffix: '-sentence-audio-v2.mp3',
    directory: 'audio',
    contentType: 'audio/mpeg',
  },
} as const;

export async function GET(_request: Request, context: RouteContext) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response('Not found', { status: 404 });
  }

  const { contentId, kind } = await context.params;
  if (!/^[a-z0-9-]+$/.test(contentId) || !(kind in mediaKinds)) {
    return new Response('Not found', { status: 404 });
  }

  const mediaKind = mediaKinds[kind as keyof typeof mediaKinds];
  const filePath = resolve(
    process.cwd(),
    '../../content/packs/learnbox-start',
    mediaKind.directory,
    `${contentId}${mediaKind.suffix}`,
  );

  try {
    const media = await readFile(filePath);
    return new Response(media, {
      headers: {
        'Content-Type': mediaKind.contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
