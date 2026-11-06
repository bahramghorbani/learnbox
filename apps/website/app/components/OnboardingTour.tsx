'use client';

import { useRef, useState } from 'react';

const slideCount = 5;
const slideSrc = (n: number) => `/images/onboarding/slide-${n}.jpg`;

const slideCopy = [
  {
    title: 'به LearnBox خوش اومدی 👋',
    body: 'یادگیری لغات آلمانی رو با خرگوش کوچولوی ما شروع کن — ساده، سریع و هر روز.',
    cta: 'بعدی',
  },
  {
    title: 'هر کارت رو با یه لمس جواب بده',
    body: 'اگه بلدی «بلدم» رو بزن، اگه نه «بلد نیستم» — خودمون بقیه‌ش رو می‌چینیم.',
    cta: 'بعدی',
  },
  {
    title: 'جعبه‌ی هوشمند یادآوری',
    body: 'لغاتی که سخت‌ترن بیشتر برمی‌گردن، لغاتی که بلدی کمتر مزاحمت می‌شن.',
    cta: 'بعدی',
  },
  {
    title: 'فروشگاه بسته‌های آموزشی',
    body: 'وقتی آماده بودی، بسته‌های تخصصی‌تر رو از فروشگاه LearnBox بردار.',
    cta: 'بعدی',
  },
  {
    title: 'همین الان شروع کن 🚀',
    body: 'اولین کارتت منتظرته. بریم که یاد بگیریم!',
    cta: 'بزن بریم 🚀',
  },
] as const;

function persistSlide(body: Record<string, unknown>) {
  void fetch('/api/learner/onboarding-tour', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  }).catch(() => undefined);
}

/**
 * Redesigned first-login tour: real HTML text/dots/CTA/skip button over
 * illustration backgrounds (not baked into the image, so nothing ever gets
 * cropped on a different aspect ratio), with an explicit transform-driven
 * slider instead of native RTL scroll-snap (whose swipe direction and
 * initial-scroll-offset behavior is inconsistent across browsers).
 */
export function OnboardingTour({
  initialSlide,
  onDone,
}: {
  initialSlide: number;
  onDone: () => void;
}) {
  const start = Math.min(Math.max(initialSlide, 0), slideCount - 1);
  const [slide, setSlide] = useState(start);
  const [dragPct, setDragPct] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; dragging: boolean } | null>(null);

  const goTo = (index: number) => {
    const next = Math.min(Math.max(index, 0), slideCount - 1);
    setSlide(next);
    setDragPct(0);
    persistSlide({ slide: next });
  };

  const finish = () => {
    persistSlide({ done: true });
    onDone();
  };

  const onNext = () => (slide === slideCount - 1 ? finish() : goTo(slide + 1));

  const onPointerDown = (event: React.PointerEvent) => {
    dragState.current = { startX: event.clientX, dragging: true };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const state = dragState.current;
    if (!state?.dragging || !trackRef.current) return;
    const width = trackRef.current.getBoundingClientRect().width || 1;
    setDragPct(((event.clientX - state.startX) / width) * 100);
  };
  const endDrag = () => {
    const state = dragState.current;
    if (!state?.dragging) return;
    dragState.current = null;
    const threshold = 12; // percent of slide width
    if (dragPct < -threshold) goTo(slide + 1);
    else if (dragPct > threshold) goTo(slide - 1);
    else setDragPct(0);
  };

  return (
    <div className="onboarding-tour" data-testid="onboarding-tour">
      <button type="button" className="onboarding-tour-skip" onClick={finish}>
        رد کردن
      </button>
      <div
        ref={trackRef}
        className="onboarding-tour-track"
        style={{
          transform: `translateX(${slide * 100 + dragPct}%)`,
          transition: dragState.current ? 'none' : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {slideCopy.map((copy, index) => (
          <div key={index} className="onboarding-tour-slide">
            <div
              className="onboarding-tour-art"
              style={{ backgroundImage: `url(${slideSrc(index + 1)})` }}
              role="img"
              aria-label={copy.title}
            />
            <div className="onboarding-tour-card">
              <div className="onboarding-tour-dots">
                {slideCopy.map((_, dotIndex) => (
                  <span key={dotIndex} className={dotIndex === slide ? 'active' : undefined} />
                ))}
              </div>
              <h1>{copy.title}</h1>
              <p>{copy.body}</p>
              <button type="button" className="onboarding-tour-cta" onClick={onNext}>
                {copy.cta}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
