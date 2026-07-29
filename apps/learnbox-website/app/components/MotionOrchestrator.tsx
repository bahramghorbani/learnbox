'use client';

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function MotionOrchestrator() {
  useEffect(() => {
    const root = document.documentElement;
    const scenes = Array.from(document.querySelectorAll<HTMLElement>('[data-motion]'));
    const reducedMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      new URLSearchParams(window.location.search).get('motion') === 'reduced';
    const fullMotion = window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;

    root.classList.add('motion-ready');
    root.dataset.motionProfile = reducedMotion ? 'reduced' : fullMotion ? 'full' : 'standard';

    if (reducedMotion || !('IntersectionObserver' in window)) {
      scenes.forEach((scene) => scene.classList.add('is-visible'));
      return () => {
        root.classList.remove('motion-ready');
        delete root.dataset.motionProfile;
      };
    }

    gsap.registerPlugin(ScrollTrigger);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.18 },
    );

    scenes.forEach((scene) => observer.observe(scene));

    const motionContext = gsap.context(
      () => {
        gsap.to('[data-parallax="hero-sky"]', {
          yPercent: fullMotion ? 8 : 3,
          scale: fullMotion ? 1.035 : 1.015,
          ease: 'none',
          scrollTrigger: {
            trigger: '[data-wallpaper="hero"]',
            start: 'top top',
            end: 'bottom top',
            scrub: fullMotion ? 1.1 : 0.7,
          },
        });

        if (fullMotion) {
          gsap.to('[data-parallax="hero-landmarks"]', {
            yPercent: 14,
            scale: 1.055,
            ease: 'none',
            scrollTrigger: {
              trigger: '[data-wallpaper="hero"]',
              start: 'top top',
              end: 'bottom top',
              scrub: 0.85,
            },
          });
          gsap.to('[data-parallax="hero-route"]', {
            xPercent: -18,
            yPercent: 42,
            rotate: 3,
            ease: 'none',
            scrollTrigger: {
              trigger: '[data-wallpaper="hero"]',
              start: 'top top',
              end: 'bottom top',
              scrub: 0.65,
            },
          });
        }

        gsap.fromTo(
          '[data-parallax="journey-sky"]',
          { yPercent: fullMotion ? -5 : -2, scale: fullMotion ? 1.06 : 1.025 },
          {
            yPercent: fullMotion ? 7 : 3,
            scale: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: '[data-wallpaper="journey"]',
              start: 'top bottom',
              end: 'bottom top',
              scrub: fullMotion ? 1.25 : 0.8,
            },
          },
        );

        if (fullMotion) {
          gsap.fromTo(
            '[data-parallax="journey-landmarks"]',
            { yPercent: -9, xPercent: 2 },
            {
              yPercent: 13,
              xPercent: -2,
              ease: 'none',
              scrollTrigger: {
                trigger: '[data-wallpaper="journey"]',
                start: 'top bottom',
                end: 'bottom top',
                scrub: 0.9,
              },
            },
          );
          gsap.fromTo(
            '[data-parallax="journey-route"]',
            { xPercent: 18, yPercent: -25, rotate: -6 },
            {
              xPercent: -24,
              yPercent: 38,
              rotate: 5,
              ease: 'none',
              scrollTrigger: {
                trigger: '[data-wallpaper="journey"]',
                start: 'top bottom',
                end: 'bottom top',
                scrub: 0.75,
              },
            },
          );
        }
      },
      document.querySelector('.site') ?? document.body,
    );

    return () => {
      observer.disconnect();
      motionContext.revert();
      root.classList.remove('motion-ready');
      delete root.dataset.motionProfile;
    };
  }, []);

  return null;
}
