'use client';

import Image from 'next/image';
import { useState } from 'react';
import { SummerBackdrop } from '../../../src/themes/summer';
import { MotionOrchestrator } from '../MotionOrchestrator';
import { LandingHeader } from './LandingHeader';
import { LearningPaths } from './LearningPaths';

const wordDetails = [
  ['تلفظ', '/diː ˈvoːnʊŋ/'],
  ['معنی', 'خانه / آپارتمان'],
  ['مثال', 'Die Wohnung ist nah am Bahnhof.'],
  ['جنسیت', 'مونث: die'],
  ['جمع', 'die Wohnungen'],
  ['سطح', 'A1'],
];

const social = [
  ['Telegram', 'خبرهای محصول و یادآوری‌های مرور'],
  ['Instagram', 'درس‌های تصویری کوتاه آلمانی'],
  ['LinkedIn', 'داستان محصول و مسیر توسعه LearnBox'],
  ['Pinterest', 'فلش‌کارت‌ها و ایده‌های یادگیری'],
];

export function LandingExperience() {
  const [notice, setNotice] = useState('');
  const unavailable = (label: string) =>
    setNotice(`${label} به‌محض ثبت نشانی رسمی در دسترس قرار می‌گیرد.`);

  return (
    <main className="site-v3">
      <MotionOrchestrator />
      <a className="skip" href="#main-story">
        پرش به محتوای اصلی
      </a>
      <div className="hero-shell" data-motion="hero" data-scene>
        <SummerBackdrop priority />
        <LandingHeader onStart={() => unavailable('شروع یادگیری')} />
        <section id="top" className="hero-v3 wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="kicker">یادگیری آلمانی، در زمان درست</p>
            <h1 id="hero-title">کلمه‌ها را فقط حفظ نکن؛ برای همیشه یاد بگیر.</h1>
            <p>
              LearnBox با مرور هوشمند، جعبه لایتنر و تمرین‌های کوتاه روزانه کمک می‌کند واژه‌های
              آلمانی را بهتر یاد بگیری و درست در زمانی که لازم است، دوباره مرورشان کنی.
            </p>
            <div className="hero-actions">
              <button
                className="button button--primary"
                onClick={() => unavailable('شروع یادگیری')}
              >
                یادگیری را شروع کن
              </button>
              <a className="button button--ghost" href="#method">
                ببین LearnBox چطور کار می‌کند
              </a>
            </div>
            {notice && (
              <p className="status-notice" role="status">
                {notice}
              </p>
            )}
          </div>
          <div className="hero-world" aria-label="BuBu در یک روز تابستانی برلین">
            <div className="location-chip">برلین · Berlin</div>
            <span className="floating-word word-a" lang="de">
              lernen <small>یاد گرفتن</small>
            </span>
            <span className="floating-word word-b" lang="de">
              der Beruf <small>شغل</small>
            </span>
            <svg className="review-route" viewBox="0 0 620 450" aria-hidden="true">
              <path d="M60 92C182 26 214 211 344 142s130 105 219 193" />
            </svg>
            <Image
              className="bubu bubu--hero"
              src="/themes/summer/bubu/hero-wave-v3.png"
              alt="BuBu، همراه یادگیری LearnBox، در برلین"
              width={768}
              height={1152}
              priority
              sizes="(max-width: 720px) 76vw, 510px"
            />
          </div>
        </section>
      </div>

      <section
        id="main-story"
        className="scene forgetting-scene"
        data-motion="forgetting"
        data-scene
      >
        <div className="wrap forgetting-layout">
          <div className="scene-heading">
            <span>پیش از فراموشی</span>
            <h2>چرا کلمه‌هایی که یاد می‌گیریم، خیلی زود فراموش می‌شوند؟</h2>
            <p>
              وقتی واژه‌ها بدون برنامه و فقط یک‌بار مرور شوند، حتی کلمه‌های مهم هم بعد از چند روز از
              ذهن دور می‌شوند. LearnBox زمان مناسب مرور هر واژه را پیدا می‌کند تا پیش از فراموش‌شدن،
              دوباره آن را ببینی.
            </p>
          </div>
          <div className="forgetting-world">
            {['der Termin', 'wichtig', 'die Wohnung', 'verstehen'].map((word, index) => (
              <span key={word} className={`lost-word lost-word--${index + 1}`} lang="de">
                {word}
              </span>
            ))}
            <div className="ordered-stack" aria-label="کارت‌های مرتب‌شده">
              <i lang="de">heute</i>
              <i lang="de">morgen</i>
              <i lang="de">später</i>
            </div>
            <Image
              className="bubu bubu--recovery"
              src="/themes/summer/bubu/cards-recovery-v3.png"
              alt="BuBu در حال جمع‌کردن کارت‌های فراموش‌شده"
              width={640}
              height={960}
              sizes="(max-width: 720px) 68vw, 410px"
            />
          </div>
        </div>
      </section>

      <section id="method" className="scene leitner-scene" data-motion="leitner" data-scene>
        <div className="wrap">
          <div className="scene-heading scene-heading--center">
            <span>جعبه لایتنر LearnBox</span>
            <h2>هر کلمه، در زمان مناسب دوباره برمی‌گردد.</h2>
            <p>
              واژه‌های دشوار زودتر مرور می‌شوند و واژه‌هایی که بهتر یاد گرفته‌ای، با فاصله بیشتری
              بازمی‌گردند. به این شکل، وقتت را بیشتر روی چیزهایی می‌گذاری که واقعاً به تمرین نیاز
              دارند.
            </p>
          </div>
          <div className="leitner-stage">
            <svg viewBox="0 0 900 240" aria-hidden="true">
              <path className="leitner-path" d="M75 128H824" />
              <path className="leitner-return" d="M645 128C610 28 270 28 226 128" />
            </svg>
            {[
              ['مرور امروز', 'der Termin'],
              ['فردا', 'die Wohnung'],
              ['۳ روز بعد', 'verstehen'],
              ['ماندگار', 'die Erfahrung'],
            ].map(([label, word], index) => (
              <article key={word} className={`leitner-card leitner-card--${index + 1}`}>
                <small>{label}</small>
                <strong lang="de">{word}</strong>
              </article>
            ))}
          </div>
          <ul className="benefits">
            {[
              'مرور فاصله‌دار',
              'تمرکز روی واژه‌های دشوار',
              'برنامه مرور روزانه',
              'کاهش فراموشی',
            ].map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="scene vocabulary-scene" data-motion="vocabulary" data-scene>
        <div className="wrap vocabulary-layout">
          <div className="word-stage">
            <article className="word-card">
              <header>
                <span>واژهٔ امروز</span>
                <b lang="de">die Wohnung</b>
              </header>
              <div className="word-visual" aria-hidden="true">
                <span>🏠</span>
              </div>
              <ol>
                {wordDetails.map(([label, value]) => (
                  <li key={label} data-word-detail>
                    <small>{label}</small>
                    <strong lang={label === 'مثال' ? 'de' : undefined}>{value}</strong>
                  </li>
                ))}
              </ol>
            </article>
            <div className="bubu-closeup">
              <Image
                className="bubu"
                src="/themes/summer/bubu/learning-focus-v3.png"
                alt="نمای نزدیک BuBu در حال معرفی تلفظ و مثال"
                width={600}
                height={900}
                sizes="260px"
              />
            </div>
          </div>
          <div className="scene-heading">
            <span>بیشتر از ترجمه</span>
            <h2>کلمه را در متن، تصویر و صدا یاد بگیر.</h2>
            <p>
              فقط دیدن ترجمه برای یادگیری عمیق کافی نیست. تلفظ، مثال کاربردی، تصویر و اطلاعات مهم هر
              واژه کمک می‌کنند آن را بهتر به خاطر بسپاری و در مکالمه راحت‌تر استفاده کنی.
            </p>
          </div>
        </div>
      </section>

      <LearningPaths />

      <section className="scene progress-scene" data-motion="progress" data-scene>
        <div className="wrap progress-layout">
          <div className="scene-heading">
            <span>پیشرفت قابل دیدن</span>
            <h2>هر روز کمی جلو برو، اما متوقف نشو.</h2>
            <p>
              هدف‌های روزانه، امتیازها، نشان‌ها و همراهی BuBu کمک می‌کنند مرور واژه‌ها به بخشی ساده
              و لذت‌بخش از برنامه روزانه‌ات تبدیل شود.
            </p>
          </div>
          <div className="progress-world">
            <div className="streak">
              <b>۷</b>
              <span>روز پیوسته</span>
            </div>
            <div className="progress-ring">
              <b>۸۰٪</b>
              <span>هدف امروز</span>
            </div>
            <div className="badge">
              ✓<span>نشان استمرار</span>
            </div>
            <div className="level">
              <span>سطح ۴</span>
              <i />
            </div>
            <Image
              className="bubu bubu--celebrate"
              src="/themes/summer/bubu/progress-celebrate-v3.png"
              alt="BuBu در حال جشن‌گرفتن پیشرفت روزانه"
              width={650}
              height={975}
              sizes="(max-width: 720px) 62vw, 360px"
            />
          </div>
        </div>
      </section>

      <section id="product" className="scene product-scene" data-motion="product" data-scene>
        <div className="wrap product-layout">
          <div className="scene-heading scene-heading--light">
            <span>محیط واقعی یادگیری</span>
            <h2>یادگیری ساده، منظم و همیشه در دسترس.</h2>
            <p>
              مرورهای امروز، میزان پیشرفت و واژه‌هایی که به تمرین بیشتری نیاز دارند، همه در یک محیط
              روشن و قابل‌فهم در اختیار تو هستند.
            </p>
          </div>
          <div className="device-stage" aria-label="نمونه نمایشی رابط LearnBox">
            <div className="app-screen app-screen--back">
              <small>واژه‌های دشوار</small>
              <b lang="de">der Termin</b>
              <span>امروز مرور کن</span>
            </div>
            <div className="app-screen app-screen--middle">
              <small>مرورهای امروز</small>
              <b>۱۲ واژه</b>
              <span>۴ واژه باقی مانده</span>
            </div>
            <div className="app-screen app-screen--front">
              <small>LearnBox</small>
              <b lang="de">die Erfahrung</b>
              <span>تجربه</span>
              <div>
                <button>دوباره</button>
                <button>بلدم</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="download" className="scene download-scene" data-motion="download" data-scene>
        <SummerBackdrop scene="rhine" />
        <div className="wrap download-layout">
          <div className="scene-heading">
            <span>کلن · کنار راین</span>
            <h2>از همین امروز یادگیری را شروع کن.</h2>
            <p>
              نسخه اندروید LearnBox را از کافه‌بازار دریافت کن یا با نسخه وب روی iPhone، iPad و
              مرورگرهای پشتیبانی‌شده، مسیر یادگیری‌ات را ادامه بده.
            </p>
            <div className="hero-actions">
              <button className="button button--primary" onClick={() => unavailable('کافه‌بازار')}>
                دانلود از کافه‌بازار
              </button>
              <button className="button button--ghost" onClick={() => unavailable('نسخه وب')}>
                ورود به نسخه وب
              </button>
            </div>
          </div>
          <div className="download-stage">
            <div className="phone-preview">
              <span>LB</span>
              <b lang="de">lernen</b>
              <small>اندروید</small>
            </div>
            <div className="web-preview">
              <span>نسخه وب</span>
              <b>مرور امروز</b>
              <i />
            </div>
            <div className="qr-preview" aria-label="پیش‌نمایش غیرفعال کد دسترسی">
              <span aria-hidden="true">▦</span>
              <small>پیش‌نمایش غیرفعال</small>
            </div>
          </div>
        </div>
      </section>

      <section className="scene social-scene" data-motion="social" data-scene>
        <div className="wrap social-layout">
          <div className="scene-heading">
            <span>شبکه‌های رسمی</span>
            <h2>بیرون از اپ هم کنار LearnBox بمان.</h2>
            <p>
              خبرهای محصول، محتوای آموزشی، نکته‌های یادگیری و مسیر توسعه LearnBox را از شبکه‌های
              رسمی دنبال کن.
            </p>
          </div>
          <ul>
            {social.map(([name, role]) => (
              <li key={name}>
                <b dir="ltr">{name}</b>
                <span>{role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="scene finale-scene" data-motion="finale" data-scene>
        <div className="wrap finale-layout">
          <Image
            className="bubu bubu--finale"
            src="/themes/summer/bubu/finale-invite-v3.png"
            alt="BuBu در حال دعوت به شروع یادگیری"
            width={700}
            height={1050}
            sizes="(max-width: 720px) 68vw, 420px"
          />
          <div className="scene-heading">
            <span>قدم اول</span>
            <h2>اولین کلمه، شروع یک مسیر تازه است.</h2>
            <p>
              BuBu آماده است تا در مرورهای روزانه همراهت باشد. تو فقط کافی است اولین قدم را برداری.
            </p>
            <button className="button button--primary" onClick={() => unavailable('شروع با BuBu')}>
              یادگیری را با BuBu شروع کن
            </button>
          </div>
        </div>
      </section>
      <footer className="footer wrap">
        <span>LearnBox</span>
        <small>یادگیری واژگان آلمانی، روشن و ماندگار.</small>
      </footer>
    </main>
  );
}
