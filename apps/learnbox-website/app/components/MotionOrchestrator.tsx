'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect } from 'react';

export function MotionOrchestrator() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 720px)').matches;
    const root = document.documentElement;
    const scenes = gsap.utils.toArray<HTMLElement>('[data-scene]');
    const chapterBackdrops = gsap.utils.toArray<HTMLElement>('[data-chapter-backdrop]');

    root.classList.add('motion-ready');
    root.dataset.motionProfile = reducedMotion ? 'reduced' : mobile ? 'mobile' : 'full';

    if (reducedMotion) {
      scenes.forEach((scene) => scene.classList.add('is-scene-active'));
      return () => {
        scenes.forEach((scene) => scene.classList.remove('is-scene-active'));
        root.classList.remove('motion-ready');
        delete root.dataset.motionProfile;
      };
    }

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(
      () => {
        scenes.forEach((scene) => {
          ScrollTrigger.create({
            trigger: scene,
            start: 'top 82%',
            end: 'bottom 18%',
            onEnter: () => scene.classList.add('is-scene-active'),
            onEnterBack: () => scene.classList.add('is-scene-active'),
            onLeave: () => scene.classList.remove('is-scene-active'),
            onLeaveBack: () => scene.classList.remove('is-scene-active'),
          });
        });

        const hero = gsap.timeline({ defaults: { ease: 'expo.out' } });
        hero.from('.hero-copy > *', {
          y: mobile ? 18 : 32,
          opacity: 0,
          filter: 'blur(8px)',
          duration: mobile ? 0.45 : 0.72,
          stagger: 0.08,
        });

        if (!mobile) {
          hero.from(
            '.bubu--hero',
            { yPercent: 13, xPercent: -4, scale: 0.9, filter: 'blur(5px)', duration: 0.78 },
            '-=.48',
          );
        }

        hero
          .from(
            '.floating-word',
            { scale: 0.72, opacity: 0, duration: 0.4, stagger: 0.12 },
            '-=.34',
          )
          .from(
            '.review-route path',
            { strokeDashoffset: 180, opacity: 0, duration: 0.62 },
            '-=.36',
          );

        if (!mobile) {
          gsap.to('[data-summer-backdrop="berlin"] [data-summer-layer="sky"]', {
            yPercent: 7,
            scale: 1.07,
            ease: 'none',
            scrollTrigger: {
              trigger: '.hero-shell',
              start: 'top top',
              end: 'bottom top',
              scrub: 1,
            },
          });
          gsap.to('[data-summer-backdrop="berlin"] [data-summer-layer="foliage"]', {
            yPercent: -14,
            ease: 'none',
            scrollTrigger: {
              trigger: '.hero-shell',
              start: 'top top',
              end: 'bottom top',
              scrub: 0.8,
            },
          });
        }

        chapterBackdrops.forEach((backdrop) => {
          const scene = backdrop.closest<HTMLElement>('[data-scene]');
          if (!scene) return;

          const far = backdrop.querySelector<HTMLElement>('[data-chapter-layer="far"]');
          const mid = backdrop.querySelector<HTMLElement>('[data-chapter-layer="mid"]');
          const near = backdrop.querySelector<HTMLElement>('[data-chapter-layer="near"]');
          const route = backdrop.querySelector<SVGPathElement>('[data-chapter-route]');
          const chapterLandmark = backdrop.querySelector<SVGSVGElement>('[data-chapter-landmark]');
          const chapter = backdrop.dataset.chapterBackdrop;
          const travel = mobile ? 4 : 12;

          if (far) {
            gsap.fromTo(
              far,
              { yPercent: -2, scale: 1.02 },
              {
                yPercent: mobile ? 2 : 3,
                scale: mobile ? 1.025 : 1.055,
                ease: 'none',
                scrollTrigger: {
                  trigger: scene,
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: mobile ? 0.45 : 1.1,
                },
              },
            );
          }

          if (mid) {
            gsap.fromTo(
              mid,
              { xPercent: mobile ? 1 : 2, yPercent: -3 },
              {
                xPercent: mobile ? -1 : -2,
                yPercent: mobile ? 3 : 5,
                ease: 'none',
                scrollTrigger: {
                  trigger: scene,
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: mobile ? 0.5 : 0.9,
                },
              },
            );
          }

          if (near) {
            gsap.fromTo(
              near,
              { yPercent: mobile ? 2 : 4 },
              {
                yPercent: mobile ? -4 : -8,
                ease: 'none',
                scrollTrigger: {
                  trigger: scene,
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: mobile ? 0.45 : 0.75,
                },
              },
            );
          }

          if (route) {
            const routeLength = route.getTotalLength();
            gsap.set(route, {
              strokeDasharray: routeLength,
              strokeDashoffset: routeLength,
            });
            gsap.to(route, {
              strokeDashoffset: 0,
              ease: 'none',
              scrollTrigger: {
                trigger: scene,
                start: 'top 78%',
                end: 'bottom 42%',
                scrub: mobile ? 0.4 : 0.8,
              },
            });
          }

          if (chapterLandmark) {
            gsap.fromTo(
              chapterLandmark,
              {
                yPercent: mobile ? 1 : 6,
                rotate: mobile ? 0 : -1.5,
              },
              {
                yPercent: mobile ? -1 : -6,
                rotate: mobile ? 0 : 1.5,
                ease: 'none',
                scrollTrigger: {
                  trigger: scene,
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: mobile ? 0.45 : 0.9,
                },
              },
            );
          }

          if (chapter === 'station' || chapter === 'rail') {
            const train = backdrop.querySelector<HTMLElement>('.chapter-train');
            if (train) {
              gsap.fromTo(
                train,
                { xPercent: mobile ? travel : travel * 2.8 },
                {
                  xPercent: mobile ? -travel : -travel * 2,
                  ease: 'none',
                  scrollTrigger: {
                    trigger: scene,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: mobile ? 0.45 : 0.7,
                  },
                },
              );
            }
          }

          if (chapter === 'street') {
            gsap.fromTo(
              backdrop.querySelectorAll('.chapter-architecture i'),
              { opacity: 0.5 },
              {
                opacity: 1,
                stagger: 0.06,
                scrollTrigger: {
                  trigger: scene,
                  start: 'top 70%',
                  end: 'center 44%',
                  scrub: 0.55,
                },
              },
            );
          }

          if (chapter === 'park') {
            const sun = backdrop.querySelector<HTMLElement>('.chapter-sun');
            if (sun) {
              gsap.fromTo(
                sun,
                { xPercent: mobile ? -3 : -12, yPercent: mobile ? 3 : 18 },
                {
                  xPercent: mobile ? 3 : 18,
                  yPercent: mobile ? -3 : -14,
                  ease: 'none',
                  scrollTrigger: {
                    trigger: scene,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: 0.8,
                  },
                },
              );
            }
          }

          if (chapter === 'square') {
            gsap.fromTo(
              backdrop.querySelectorAll('.chapter-signal'),
              { scale: 0.72, opacity: 0 },
              {
                scale: 2.8,
                opacity: 0,
                stagger: 0.12,
                scrollTrigger: {
                  trigger: scene,
                  start: 'top 72%',
                  end: 'bottom 44%',
                  scrub: 0.6,
                },
              },
            );
          }
        });

        const sceneTimelines = [
          {
            trigger: '.forgetting-scene',
            tween: () =>
              gsap
                .timeline()
                .from('.lost-word', {
                  x: () => gsap.utils.random(-80, 80),
                  y: () => gsap.utils.random(-50, 50),
                  rotate: () => gsap.utils.random(-18, 18),
                  opacity: 0.18,
                  stagger: 0.08,
                })
                .from('.ordered-stack i', { x: 70, opacity: 0, stagger: 0.08 }, '-=.18')
                .from('.bubu--recovery', { yPercent: 12, filter: 'blur(6px)' }, '-=.34'),
          },
          {
            trigger: '.leitner-scene',
            tween: () =>
              gsap
                .timeline()
                .from('.leitner-path', { strokeDasharray: 760, strokeDashoffset: 760 })
                .from(
                  '.leitner-card',
                  { x: mobile ? 45 : 100, opacity: 0, rotate: 4, stagger: 0.12 },
                  '-=.55',
                )
                .from('.leitner-return', { strokeDasharray: 520, strokeDashoffset: 520 }, '-=.3'),
          },
          {
            trigger: '.vocabulary-scene',
            tween: () =>
              gsap
                .timeline()
                .from('.word-card', { clipPath: 'inset(0 0 100% 0)', filter: 'blur(10px)' })
                .from('[data-word-detail]', { x: 24, opacity: 0, stagger: 0.075 })
                .from('.bubu-closeup', { xPercent: -18, opacity: 0 }, '-=.3'),
          },
          {
            trigger: '.progress-scene',
            tween: () =>
              gsap
                .timeline()
                .from('.streak b', { textContent: 0, snap: { textContent: 1 } })
                .from(
                  '.progress-ring, .badge, .level',
                  { scale: 0.78, opacity: 0, stagger: 0.12 },
                  '-=.2',
                )
                .from('.bubu--celebrate', { yPercent: 16, opacity: 0 }, '-=.3'),
          },
          {
            trigger: '.product-scene',
            tween: () =>
              gsap
                .timeline()
                .from('.app-screen--back', { x: -90, rotateY: 30, opacity: 0 })
                .from('.app-screen--middle', { x: 90, rotateY: -30, opacity: 0 }, '-=.5')
                .from('.app-screen--front', { y: 70, scale: 0.88, opacity: 0 }, '-=.42'),
          },
          {
            trigger: '.download-scene',
            tween: () =>
              gsap
                .timeline()
                .from('.phone-preview', { y: 90, rotate: 7, opacity: 0 })
                .from('.web-preview', { x: -90, rotate: -10, opacity: 0 }, '-=.45')
                .from('.qr-preview', { scale: 0.72, opacity: 0 }, '-=.28'),
          },
        ];

        sceneTimelines.forEach(({ trigger, tween }) => {
          const timeline = tween();
          timeline.pause();
          ScrollTrigger.create({
            trigger,
            start: 'top 72%',
            once: true,
            onEnter: () => timeline.play(),
          });
        });
      },
      document.querySelector('.site-v3') ?? document.body,
    );

    return () => {
      context.revert();
      root.classList.remove('motion-ready');
      delete root.dataset.motionProfile;
    };
  }, []);

  return null;
}
