'use client';

import { useEffect } from 'react';

export function MotionOrchestrator() {
  useEffect(() => {
    const root = document.documentElement;
    const fullMotionMedia = window.matchMedia(
      '(min-width: 721px) and (prefers-reduced-motion: no-preference)',
    );
    const mobile = false;
    const scenes = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'));
    const chapterBackdrops = Array.from(
      document.querySelectorAll<HTMLElement>('[data-chapter-backdrop]'),
    );
    const productStory = document.querySelector<HTMLElement>('[data-motion="product-story"]');
    const productStages = productStory
      ? Array.from(productStory.querySelectorAll<HTMLElement>('[data-product-stage]'))
      : [];
    const productScreens = productStory
      ? Array.from(productStory.querySelectorAll<HTMLElement>('[data-product-screen]'))
      : [];
    const productDevice = productStory?.querySelector<HTMLElement>('[data-product-device]') ?? null;

    let disposed = false;
    let generation = 0;
    let context: { revert: () => void } | undefined;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

    const resetSemanticState = () => {
      scenes.forEach((scene) => scene.classList.remove('is-scene-active'));
      productStages.forEach((stage, index) => {
        if (index === 0) stage.setAttribute('aria-current', 'true');
        else stage.removeAttribute('aria-current');
      });
      productScreens.forEach((screen) => {
        screen.classList.remove('is-product-screen-active');
        screen.removeAttribute('aria-hidden');
      });
    };

    const cancelScheduledInitialization = () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      idleId = undefined;
      timeoutId = undefined;
    };

    const stopMotion = () => {
      generation += 1;
      cancelScheduledInitialization();
      context?.revert();
      context = undefined;
      resetSemanticState();
      root.classList.remove('motion-ready');
    };

    const initializeMotion = async (runGeneration: number) => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (disposed || runGeneration !== generation || !fullMotionMedia.matches) return;

      gsap.registerPlugin(ScrollTrigger);
      const nextContext = gsap.context(
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
            if (scene.matches('[data-motion="product-story"]')) return;

            const far = backdrop.querySelector<HTMLElement>('[data-chapter-layer="far"]');
            const mid = backdrop.querySelector<HTMLElement>('[data-chapter-layer="mid"]');
            const near = backdrop.querySelector<HTMLElement>('[data-chapter-layer="near"]');
            const route = backdrop.querySelector<SVGPathElement>('[data-chapter-route]');
            const chapterLandmark =
              backdrop.querySelector<SVGSVGElement>('[data-chapter-landmark]');
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

          if (!mobile && productStory && productDevice && productStages.length > 0) {
            const productLayers = Array.from(
              productStory.querySelectorAll<HTMLElement>('[data-chapter-layer]'),
            );

            const activateProductStage = (activeId: string) => {
              const activeIndex = productStages.findIndex(
                (stage) => stage.dataset.productStage === activeId,
              );
              if (activeIndex < 0) return;

              productStages.forEach((stage, index) => {
                const isActive = index === activeIndex;
                if (isActive) stage.setAttribute('aria-current', 'true');
                else stage.removeAttribute('aria-current');

                gsap.to(stage, {
                  y: isActive ? 0 : 10,
                  opacity: isActive ? 1 : 0.68,
                  duration: 0.42,
                  ease: 'power2.out',
                  overwrite: 'auto',
                });
              });

              productScreens.forEach((screen, index) => {
                const isActive = index === activeIndex;
                const distance = Math.abs(index - activeIndex);
                screen.classList.toggle('is-product-screen-active', isActive);
                screen.setAttribute('aria-hidden', isActive ? 'false' : 'true');

                gsap.to(screen, {
                  x: isActive ? 0 : Math.max(-10, Math.min(10, (index - activeIndex) * 8)),
                  y: isActive ? 0 : Math.min(22, 8 + distance * 6),
                  scale: isActive ? 1 : Math.max(0.955, 0.99 - distance * 0.012),
                  opacity: isActive ? 1 : Math.max(0.1, 0.22 - distance * 0.035),
                  duration: 0.48,
                  ease: 'power2.out',
                  overwrite: 'auto',
                });
              });
            };

            const initialStage =
              productStages.find((stage) => stage.getAttribute('aria-current') === 'true') ??
              productStages[0];
            activateProductStage(initialStage.dataset.productStage ?? '');

            productStages.forEach((stage, index) => {
              const stageId = stage.dataset.productStage;
              if (!stageId) return;

              const layer =
                productLayers.length > 0 ? productLayers[index % productLayers.length] : undefined;
              const timeline = gsap.timeline({
                scrollTrigger: {
                  trigger: stage,
                  start: 'top 62%',
                  end: 'bottom 38%',
                  scrub: 0.55,
                  onEnter: () => activateProductStage(stageId),
                  onEnterBack: () => activateProductStage(stageId),
                },
              });

              if (layer) {
                timeline.fromTo(
                  layer,
                  { yPercent: -2 },
                  {
                    yPercent: 2,
                    ease: 'none',
                  },
                );
              }
            });
          }

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
            if (!document.querySelector(trigger)) return;
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

      if (disposed || runGeneration !== generation || !fullMotionMedia.matches) {
        nextContext.revert();
        resetSemanticState();
        return;
      }

      context = nextContext;
      ScrollTrigger.refresh();
    };

    const scheduleMotion = () => {
      const runGeneration = generation;
      const start = () => {
        idleId = undefined;
        timeoutId = undefined;
        void initializeMotion(runGeneration);
      };

      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(start, { timeout: 1400 });
      } else {
        timeoutId = globalThis.setTimeout(start, 700);
      }
    };

    const updateMotionProfile = () => {
      stopMotion();
      if (disposed) return;

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.dataset.motionProfile = reducedMotion
        ? 'reduced'
        : fullMotionMedia.matches
          ? 'full'
          : 'mobile';

      if (!fullMotionMedia.matches) return;
      root.classList.add('motion-ready');
      scheduleMotion();
    };

    fullMotionMedia.addEventListener('change', updateMotionProfile);
    updateMotionProfile();

    return () => {
      disposed = true;
      fullMotionMedia.removeEventListener('change', updateMotionProfile);
      stopMotion();
      delete root.dataset.motionProfile;
    };
  }, []);

  return null;
}
