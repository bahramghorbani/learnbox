'use client';

import { useEffect, useState } from 'react';
import { siteConfig } from '../../../src/config/site.mjs';

type Platform = 'android' | 'ios' | 'web';

const badges = [
  {
    id: 'cafeBazaar',
    platform: 'android',
    src: '/badges/bazaar.webp',
    width: 413,
    height: 119,
    label: 'دانلود از کافه‌بازار',
    caption: 'اندروید',
  },
  {
    id: 'sibapp',
    platform: 'ios',
    src: '/badges/sibapp.svg',
    width: 964,
    height: 383,
    label: 'دریافت نسخهٔ iOS از سیب‌اپ',
    caption: 'آیفون و آیپد',
  },
  {
    id: 'webApp',
    platform: 'web',
    src: '/badges/webapp.webp',
    width: 886,
    height: 256,
    label: 'ورود به نسخه وب',
    caption: 'هر مرورگری',
  },
] as const;

function detectPlatform(): Platform | null {
  const agent = navigator.userAgent;
  if (/android/i.test(agent)) return 'android';
  if (/iphone|ipad|ipod/i.test(agent)) return 'ios';
  if (/macintosh/i.test(agent) && navigator.maxTouchPoints > 1) return 'ios';
  return null;
}

export function StoreBadges({
  variant,
  priority = false,
}: {
  variant: 'hero' | 'download' | 'finale';
  priority?: boolean;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => setPlatform(detectPlatform()), []);

  const available = badges.filter(
    (badge) => siteConfig.destinations[badge.id]?.status === 'available',
  );
  if (available.length === 0) return null;

  return (
    <ul className={`store-badges store-badges--${variant}`} aria-label="دریافت LearnBox">
      {available.map((badge) => {
        const href = siteConfig.destinations[badge.id].url ?? undefined;
        const external = badge.platform !== 'web';
        return (
          <li
            key={badge.id}
            data-platform={badge.platform}
            data-preferred={platform === badge.platform ? 'true' : undefined}
          >
            <a
              className="store-badge"
              href={href}
              aria-label={badge.label}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
            >
              <img
                src={badge.src}
                alt=""
                width={badge.width}
                height={badge.height}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
              />
            </a>
            {variant === 'download' ? (
              <span className="store-badge__caption">{badge.caption}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
