import { get } from '@vercel/blob';

import privateMediaAttestation from '../../../../../../../content/packs/learnbox-start/validation/start-a1-private-media-attestation.json';
import { readLearnerSession } from '../../../../../lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ contentId: string; kind: string }>;
};

const kindByRouteSegment = {
  image: 'image',
  'word-audio': 'word_audio',
  'sentence-audio': 'sentence_audio',
} as const;

const privateMediaByKey = new Map(
  privateMediaAttestation.assets.map((asset) => [`${asset.contentId}:${asset.kind}`, asset]),
);

export async function GET(request: Request, context: RouteContext) {
  if (process.env.LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED !== 'true') {
    return new Response('Not found', { status: 404 });
  }

  if (!readLearnerSession(request)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const { contentId, kind } = await context.params;
  const assetKind = kindByRouteSegment[kind as keyof typeof kindByRouteSegment];
  if (!/^[a-z0-9-]+$/.test(contentId) || !assetKind) {
    return new Response('Not found', { status: 404 });
  }

  const asset = privateMediaByKey.get(`${contentId}:${assetKind}`);
  if (!asset) return new Response('Not found', { status: 404 });

  try {
    const media = await get(asset.pathname, { access: 'private' });
    if (!media) return new Response('Not found', { status: 404 });

    return new Response(media.stream, {
      headers: {
        'Content-Type': asset.kind === 'image' ? 'image/png' : 'audio/mpeg',
        'Cache-Control': 'private, no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Media unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
