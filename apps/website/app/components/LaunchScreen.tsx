'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { activeLaunchExperience } from '../launch-experience';

type LaunchState = 'visible' | 'exiting' | 'hidden';

export function LaunchScreen() {
  const [state, setState] = useState<LaunchState>('visible');
  const [imageSource, setImageSource] = useState('/api/launch/splash');
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!imageReady) return;

    const beginExit = window.setTimeout(
      () => setState('exiting'),
      activeLaunchExperience.durationMs,
    );
    const hide = window.setTimeout(
      () => setState('hidden'),
      activeLaunchExperience.durationMs + 240,
    );

    return () => {
      window.clearTimeout(beginExit);
      window.clearTimeout(hide);
    };
  }, [imageReady]);

  if (state === 'hidden') return null;

  return (
    <div
      className={`launch-screen launch-screen-${state}`}
      role="status"
      aria-label="در حال آماده‌سازی LearnBox"
    >
      {imageFailed ? (
        <div className="launch-screen-fallback" aria-hidden="true">
          <span className="launch-screen-fallback-mark">LB</span>
          <span className="launch-screen-fallback-name">LearnBox</span>
        </div>
      ) : (
        <Image
          key={imageSource}
          alt=""
          className="launch-screen-image"
          src={imageSource}
          fill
          priority
          unoptimized
          sizes="100vw"
          onLoad={() => setImageReady(true)}
          onError={() => {
            if (imageSource !== activeLaunchExperience.imagePath) {
              setImageSource(activeLaunchExperience.imagePath);
            } else {
              setImageFailed(true);
              setImageReady(true);
            }
          }}
        />
      )}
      <span className="launch-screen-shade" aria-hidden="true" />
      <span className="launch-screen-loader" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
