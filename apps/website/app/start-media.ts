import type { LearnerAuthMode } from './learner-auth-mode';

export type StartMediaMode = 'placeholder' | 'local-preview' | 'private-session' | 'bundled';

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
  if (privateMediaFlag === 'true' && authMode === 'server-otp') return 'private-session';
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'local-preview';
  // Production VPS: not localhost, not Vercel
  if (!hostname.endsWith('.vercel.app')) return 'bundled';
  return 'placeholder';
}

export function buildStartMediaSources(contentId: string, mode: StartMediaMode): StartMediaSources {
  if (mode === 'placeholder' || !validContentId.test(contentId)) return {};

  if (mode === 'bundled') {
    return {
      image: `/api/content-media/${contentId}/image`,
      wordAudio: `/api/content-media/${contentId}/word-audio`,
      sentenceAudio: `/api/content-media/${contentId}/sentence-audio`,
    };
  }

  const route = mode === 'private-session' ? 'private-media' : 'local-preview-media';
  const basePath = `/api/${route}/${contentId}`;
  return {
    image: `${basePath}/image`,
    wordAudio: `${basePath}/word-audio`,
    sentenceAudio: `${basePath}/sentence-audio`,
  };
}
