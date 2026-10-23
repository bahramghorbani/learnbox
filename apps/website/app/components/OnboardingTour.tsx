'use client';

import { useEffect, useRef, useState } from 'react';

const slideCount = 5;
const slideSrc = (n: number) => `/images/onboarding/slide-${n}.jpg`;

/** Final first-login artwork, free swipe both directions via native scroll-snap, resumable. */
export function OnboardingTour({
  initialSlide,
  onDone,
}: {
  initialSlide: number;
  onDone: () => void;
}) {
  const start = Math.min(Math.max(initialSlide, 0), slideCount - 1);
  const [slide, setSlide] = useState(start);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Jump to the resume slide without animating on first mount.
  useEffect(() => {
    slideRefs.current[start]?.scrollIntoView({ block: 'nearest', inline: 'start' });
  }, [start]);

  // One IntersectionObserver reports whichever slide is actually centered, in either
  // swipe direction, instead of hand-computing scrollLeft math (which flips sign in RTL
  // inconsistently across browsers).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (!visible) return;
        const index = slideRefs.current.indexOf(visible.target as HTMLDivElement);
        if (index !== -1) setSlide(index);
      },
      { root: track, threshold: 0.6 },
    );
    slideRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void fetch('/api/learner/onboarding-tour', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slide }),
      credentials: 'same-origin',
    }).catch(() => undefined);
  }, [slide]);

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
    <div className="onboarding-tour" data-testid="onboarding-tour" ref={trackRef}>
      {Array.from({ length: slideCount }, (_, index) => (
        <div
          key={index}
          className="onboarding-tour-slide"
          ref={(element) => {
            slideRefs.current[index] = element;
          }}
        >
          <img
            src={slideSrc(index + 1)}
            alt=""
            draggable={false}
            onClick={index === slideCount - 1 ? finish : undefined}
          />
        </div>
      ))}
    </div>
  );
}
