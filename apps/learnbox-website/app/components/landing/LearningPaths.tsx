'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';
import { GermanyChapterBackdrop } from '../../../src/themes/summer';

const paths = [
  ['مهاجرت کاری', 'واژه‌های محیط کار، قرارداد، جلسه و شروع حرفه‌ای در آلمان.', 'Berlin'],
  ['مهاجرت تحصیلی', 'واژه‌های دانشگاه، ثبت‌نام، کلاس و زندگی دانشجویی.', 'München'],
  ['مکالمه روزمره', 'واژه‌های خرید، رفت‌وآمد و گفت‌وگوهای روزانه.', 'Hamburg'],
  ['زبان عمومی', 'پایه‌ای منظم برای ساختن دایرهٔ واژگان آلمانی.', 'Deutschland'],
  ['آمادگی آزمون', 'مرور هدفمند واژه‌های پرتکرار آزمون.', 'Prüfung'],
] as const;

export function LearningPaths() {
  const [selected, setSelected] = useState(0);
  const current = paths[selected];

  return (
    <section id="paths" className="scene paths-scene" data-motion="paths">
      <GermanyChapterBackdrop chapter="map" />
      <div className="wrap">
        <div className="scene-heading chapter-heading-veil">
          <span>مسیر شخصی تو</span>
          <h2>مسیر یادگیری را با هدف خودت هماهنگ کن.</h2>
          <p>
            چه برای مهاجرت کاری و تحصیلی آماده می‌شوی، چه می‌خواهی در مکالمه روزمره پیشرفت کنی،
            مسیرهای LearnBox کمک می‌کنند از واژه‌هایی شروع کنی که به هدف واقعی تو نزدیک‌ترند.
          </p>
        </div>
        <div className="path-layout">
          <div className="path-tabs" role="tablist" aria-label="مسیرهای یادگیری">
            {paths.map(([label], index) => (
              <button
                key={label}
                role="tab"
                aria-selected={selected === index}
                onClick={() => setSelected(index)}
              >
                <span>{index < 2 ? '★' : '·'}</span>
                {label}
              </button>
            ))}
          </div>
          <div className="path-stage" data-motion-stage>
            <div className="germany-route" aria-hidden="true">
              <svg viewBox="0 0 520 280">
                <path d="M35 216C142 236 157 83 260 128s103-68 225-75" />
                <circle cx="35" cy="216" r="9" />
                <circle cx="260" cy="128" r="9" />
                <circle cx="485" cy="53" r="9" />
              </svg>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={selected}
                className="path-copy"
                initial={{
                  opacity: 0,
                  transform: 'translateX(24px)',
                  filter: 'blur(8px)',
                }}
                animate={{
                  opacity: 1,
                  transform: 'translateX(0px)',
                  filter: 'blur(0px)',
                }}
                exit={{
                  opacity: 0,
                  transform: 'translateX(-18px)',
                  filter: 'blur(6px)',
                }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                <small lang="de">{current[2]}</small>
                <h3>{current[0]}</h3>
                <p>{current[1]}</p>
              </motion.div>
            </AnimatePresence>
            <Image
              className="bubu bubu--path"
              src="/themes/summer/bubu/learning-focus-v3.png"
              alt="BuBu در حال اشاره به مسیر یادگیری آلمانی"
              width={640}
              height={960}
              sizes="(max-width: 720px) 54vw, 330px"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
