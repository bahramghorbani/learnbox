import type { LearnerAuthMode } from './learner-auth-mode';

export type StartMediaMode = 'placeholder' | 'local-preview' | 'private-session';

export type StartMediaSources = {
  image?: string;
  wordAudio?: string;
  sentenceAudio?: string;
};

type StartMediaModeInput = {
  privateMediaFlag?: string;
  authMode: LearnerAuthMode;
  hostname: string;
};

const validContentId = /^[a-z0-9-]+$/;

export function resolveStartMediaMode({
  privateMediaFlag,
  authMode,
  hostname,
}: StartMediaModeInput): StartMediaMode {
  // Private Vercel Blob delivery: exact flag 'true' (case-sensitive) AND server-otp only.
  // Auth boundary is enforced server-side on every media route — not by hostname.
  if (privateMediaFlag === 'true' && authMode === 'server-otp') return 'private-session';
  // Local filesystem preview: localhost dev only.
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'local-preview';
  // All other cases: no media sources (UI shows placeholder).
  return 'placeholder';
}

export function buildStartMediaSources(contentId: string, mode: StartMediaMode): StartMediaSources {
  if (mode === 'placeholder' || !validContentId.test(contentId)) return {};

  const route = mode === 'private-session' ? 'private-media' : 'local-preview-media';
  const basePath = `/api/${route}/${contentId}`;
  return {
    image: `${basePath}/image`,
    wordAudio: `${basePath}/word-audio`,
    sentenceAudio: `${basePath}/sentence-audio`,
  };
}
