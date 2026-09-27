'use client';

import { useEffect, useState } from 'react';

import { buildStartMediaSources, type StartMediaMode } from '../start-media';

type StartMediaVisualProps = {
  contentId: string;
  mode: StartMediaMode;
};

export function StartMediaVisual({ contentId, mode }: StartMediaVisualProps) {
  const [failed, setFailed] = useState(false);
  const sources = buildStartMediaSources(contentId, mode);

  useEffect(() => setFailed(false), [contentId, mode]);

  const unavailable = failed || !sources.image;
  // 'server-media' delivers the real recorded asset through the authenticated
  // content-media route, so it carries no notice: showing a "being prepared"
  // message next to a successfully rendered image contradicts what the user sees.
  const notice = failed
    ? 'رسانهٔ این کارت اکنون در دسترس نیست.'
    : mode === 'private-session'
      ? 'رسانهٔ محافظت‌شدهٔ آلفا فقط در نشست امن نمایش داده می‌شود.'
      : mode === 'local-preview'
        ? 'تصویر و صدای نامزد فقط برای بررسی محلی نمایش داده می‌شوند.'
        : mode === 'server-media'
          ? null
          : 'تصویر و صدای ضبط‌شدهٔ این کارت در حال آماده‌سازی است.';

  return (
    <>
      <div className="word-visual word-visual-staged" aria-hidden="true">
        {unavailable ? (
          <span>◌</span>
        ) : (
          <img src={sources.image} alt="" onError={() => setFailed(true)} />
        )}
      </div>
      {notice ? (
        <p className="media-pending" role={failed ? 'status' : undefined}>
          {notice}
        </p>
      ) : null}
    </>
  );
}
