import { get } from '@vercel/blob';

import privateMediaAttestation from '../../../../../../../content/packs/learnbox-start/validation/start-a1-35-final-private-media-attestation.json';
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

// LB-DS-074: the pending JPEG Start candidates attest `image/jpeg`, so the
// delivered content type follows the attested pathname extension (explicit
// allowlist) instead of a hardcoded `image/png`. Request input and provider
// headers are never trusted, and an unknown extension fails closed.
const contentTypeByExtension: Record<string, string | undefined> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp3: 'audio/mpeg',
};

function contentTypeForPathname(pathname: string) {
  const extension = /\.([a-z0-9]+)$/.exec(pathname.toLowerCase())?.[1];
  return extension ? (contentTypeByExtension[extension] ?? null) : null;
}

function isStagingPrivateMediaEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.VERCEL_ENV === 'production' || environment.APP_ENV === 'production') return false;
  return (
    environment.VERCEL_ENV === 'preview' ||
    environment.APP_ENV === 'staging' ||
    (environment.VERCEL_ENV === undefined &&
      environment.APP_ENV === undefined &&
      environment.NODE_ENV === 'development')
  );
}

// The final 35-item attestation is only serviceable in staging or local development.
// A separately approved Production delivery transition must replace this allowlist.
export async function GET(request: Request, context: RouteContext) {
  if (
    process.env.LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED !== 'true' ||
    !isStagingPrivateMediaEnvironment()
  ) {
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

  const contentType = contentTypeForPathname(asset.pathname);
  if (!contentType) return new Response('Not found', { status: 404 });

  try {
    const media = await get(asset.pathname, { access: 'private' });
    if (!media) return new Response('Not found', { status: 404 });

    return new Response(media.stream, {
      headers: {
        'Content-Type': contentType,
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
