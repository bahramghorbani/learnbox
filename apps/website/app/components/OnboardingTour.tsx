'use client';

import { useRef, useState } from 'react';

const slideCount = 5;
const slideSrc = (n: number) => `/images/onboarding/slide-${n}.jpg`;
const swipeDistance = 48;

/** Final first-login artwork with RTL forward swipe (left-to-right) and resumable progress. */
export function OnboardingTour({
  initialSlide,
  onDone,
}: {
  initialSlide: number;
  onDone: () => void;
}) {
  const [slide, setSlide] = useState(() => Math.min(Math.max(initialSlide, 0), slideCount - 1));
  const touchStartX = useRef<number | null>(null);

  const persist = (next: number) => {
    void fetch('/api/learner/onboarding-tour', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slide: next }),
      credentials: 'same-origin',
    }).catch(() => undefined);
  };

  const next = () => {
    setSlide((current) => {
      const following = Math.min(current + 1, slideCount - 1);
      if (following !== current) persist(following);
      return following;
    });
  };

  const finish = () => {
    void fetch('/api/learner/onboarding-tour', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: true }),
      credentials: 'same-origin',
    }).catch(() => undefined);
    onDone();
  };

  return (
    <div
      className="onboarding-tour"
      data-testid="onboarding-tour"
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (
          start !== null &&
          event.changedTouches[0] &&
          event.changedTouches[0].clientX - start > swipeDistance
        ) {
          next();
        }
      }}
    >
      <img
        src={slideSrc(slide + 1)}
        alt=""
        draggable={false}
        onClick={slide === slideCount - 1 ? finish : undefined}
      />
    </div>
  );
}
