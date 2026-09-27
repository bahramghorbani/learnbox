import Image from 'next/image';
import { SummerBackdrop } from '../../../src/themes/summer';

type VariantPreviewProps = {
  variant: 'a' | 'b' | 'c';
};

const variants = {
  a: {
    label: 'Variant A · Cinematic Summer Journey',
    note: 'تمرکز: سفر سینمایی تابستانی در آلمان',
    className: 'variant-preview--a',
  },
  b: {
    label: 'Variant B · LearnBox Character World',
    note: 'تمرکز: جهان بنفش و شخصیت‌محور LearnBox',
    className: 'variant-preview--b',
  },
  c: {
    label: 'Variant C · Hybrid Product and Story',
    note: 'جهت منتخب: وضوح محصول + داستان تابستانی آلمان',
    className: 'variant-preview--c',
  },
} as const;

export function VariantPreview({ variant }: VariantPreviewProps) {
  const config = variants[variant];

  return (
    <main className={`variant-preview ${config.className}`} data-variant={variant}>
      <section className="variant-hero is-scene-active">
        {variant !== 'b' && <SummerBackdrop priority />}
        <header className="wrap">
          <b dir="ltr">LearnBox</b>
          <span>{config.label}</span>
        </header>
        <div className="wrap variant-hero__content">
          <div>
            <small>{config.note}</small>
            <h1>آلمانی را در زمان درست مرور کن.</h1>
            <p lang="de">lernen · der Beruf · die Wohnung</p>
            <button className="button button--primary">یادگیری را شروع کن</button>
          </div>
          <Image
            src="/themes/summer/bubu/hero-wave-v3.png"
            alt="BuBu در واریانت آزمایشی"
            width={500}
            height={750}
          />
        </div>
      </section>
      <section className="variant-strip wrap" aria-label="نمونه‌های لازم واریانت">
        <article>
          <b>صحنه آموزشی</b>
          <span lang="de">die Wohnung → مرور فردا</span>
        </article>
        <article>
          <b>نمای محصول</b>
          <span>مرور امروز · پیشرفت</span>
        </article>
        <article>
          <b>دانلود</b>
          <span>اندروید · نسخه وب</span>
        </article>
        <article>
          <b>نمونه موبایل</b>
          <span>CTA روشن · BuBu با crop اختصاصی</span>
        </article>
        <article>
          <b>نمونه موشن</b>
          <span>مسیر SVG · حرکت کارت · تغییر عمق</span>
        </article>
      </section>
    </main>
  );
}
