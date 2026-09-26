'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export type BoboAnimation =
  | 'float'
  | 'slideIn'
  | 'jumpUp'
  | 'headShake'
  | 'dance'
  | 'wiggle'
  | 'none';

type BoboExpression = 'welcome' | 'encourage' | 'celebrate' | 'recovery' | 'focus';

const boboAssets: Record<BoboExpression, { alt: string; src: string }> = {
  welcome: { alt: 'بوبو با دست‌های باز به تو خوش‌آمد می‌گوید', src: '/images/bobo/welcome-v2.png' },
  encourage: { alt: 'بوبو با لبخند تو را تشویق می‌کند', src: '/images/bobo/encourage-v2.png' },
  celebrate: { alt: 'بوبو موفقیت تو را جشن می‌گیرد', src: '/images/bobo/celebrate-v2.png' },
  recovery: { alt: 'بوبو برای ادامه‌دادن همراه تو است', src: '/images/bobo/recovery-v2.png' },
  focus: { alt: 'بوبو با تمرکز در کنار تو است', src: '/images/bobo/focus-v2.png' },
};

const animationStyles: Record<BoboAnimation, string> = {
  float: 'boboFloat 3s ease-in-out infinite',
  slideIn: 'boboSlideInRight 600ms var(--ease-out) forwards',
  jumpUp: 'boboJumpUp 600ms var(--spring)',
  headShake: 'boboHeadShake 800ms ease-in-out',
  dance: 'boboDance 800ms var(--spring)',
  wiggle: 'boboWiggle 600ms var(--spring) infinite',
  none: 'none',
};

interface BoboProps {
  expression: BoboExpression;
  animation?: BoboAnimation;
  speech?: string;
  className?: string;
  size?: number;
  priority?: boolean;
}

export function Bobo({
  expression,
  animation = 'float',
  speech,
  className = '',
  size = 90,
  priority = false,
}: BoboProps) {
  const asset = boboAssets[expression];
  const [displayedText, setDisplayedText] = useState('');
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    if (!speech) {
      setShowBubble(false);
      setDisplayedText('');
      return;
    }
    setShowBubble(true);
    setDisplayedText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayedText(speech.slice(0, i));
      if (i >= speech.length) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [speech]);

  return (
    <div className={`bobo-container ${className}`}>
      <Image
        src={asset.src}
        alt={asset.alt}
        width={size}
        height={Math.round(size * 1.2)}
        priority={priority}
        style={{ animation: animationStyles[animation] }}
      />
      {showBubble && displayedText ? (
        <div className="speech-bubble" dir="rtl">
          {displayedText}
        </div>
      ) : null}
    </div>
  );
}
