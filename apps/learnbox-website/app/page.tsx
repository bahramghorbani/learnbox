'use client';
import { useState } from 'react';
import { MotionOrchestrator } from './components/MotionOrchestrator';

const paths = ['مهاجرت کاری', 'مهاجرت تحصیلی', 'مکالمه روزمره', 'زبان عمومی', 'آمادگی آزمون'];
const social = [
  ['تلگرام', 'خبرها و یادآوری‌های کوتاه'],
  ['اینستاگرام', 'درس‌های تصویری کوتاه'],
  ['لینکدین', 'داستان محصول و مسیر ساخت'],
  ['پینترست', 'فلش‌کارت‌ها و ایده‌های یادگیری'],
];
const Arrow = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

/** THESIS: مسیر نورانی، زمان درست بازگشت واژه را قابل دیدن می‌کند، نه یک لندینگ کارت‌محور. OWN-WORLD: شبِ بنفش عمیق، نور کهربایی و واژه‌کارت‌های شناور. STORY: مخاطب فراموشی را می‌شناسد، روش مرور را می‌بیند و شروع می‌کند. FIRST VIEWPORT: پیام و CTA در راست، دنیای یادگیری و BuBu در چپ. FORM: مسیر نورانیِ مرور، برآمده از مرجع Landing v1. */
export default function Home() {
  const [theme, setTheme] = useState<'default' | 'nowruz'>('default');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(paths[0]);
  const unavailable = (label: string) => setNotice(`${label} پس از ثبت نشانی رسمی فعال می‌شود.`);
  return (
    <main className={`site theme-${theme}`}>
      <MotionOrchestrator />
      <div className="site-backdrops" aria-hidden="true">
        <div className="story-wallpaper story-wallpaper-hero" data-wallpaper="hero">
          <img
            className="wallpaper-layer wallpaper-sky"
            data-parallax="hero-sky"
            src="/backgrounds/germany-night-hero-v1.jpg"
            alt=""
            fetchPriority="high"
          />
          <img
            className="wallpaper-layer wallpaper-landmarks"
            data-parallax="hero-landmarks"
            src="/backgrounds/germany-night-hero-v1.jpg"
            alt=""
            fetchPriority="high"
          />
          <span className="wallpaper-route route-one" data-parallax="hero-route" />
          <span className="wallpaper-route route-two" data-parallax="hero-route" />
        </div>
        <div className="story-wallpaper story-wallpaper-journey" data-wallpaper="journey">
          <img
            className="wallpaper-layer wallpaper-sky"
            data-parallax="journey-sky"
            src="/backgrounds/germany-journey-v1.jpg"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <img
            className="wallpaper-layer wallpaper-landmarks"
            data-parallax="journey-landmarks"
            src="/backgrounds/germany-journey-v1.jpg"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <span className="wallpaper-route route-three" data-parallax="journey-route" />
        </div>
      </div>
      <a className="skip" href="#story">
        پرش به محتوا
      </a>
      <header className="nav wrap">
        <a className="brand" href="#top">
          <b>LB</b>
          <span>LearnBox</span>
        </a>
        <nav aria-label="ناوبری اصلی">
          <a href="#method">روش یادگیری</a>
          <a href="#paths">مسیرها</a>
          <a href="#download">شروع</a>
        </nav>
        <div>
          <button
            className="theme"
            onClick={() => setTheme(theme === 'default' ? 'nowruz' : 'default')}
            aria-label="تغییر تم"
          >
            ◐
          </button>
          <button className="small" onClick={() => unavailable('دریافت اپلیکیشن')}>
            دریافت اپلیکیشن
          </button>
        </div>
      </header>
      <section id="top" className="hero wrap" aria-labelledby="hero-title" data-motion="hero">
        <div className="copy">
          <p className="eyebrow">✦ هر واژه، یک قدم رو به جلو</p>
          <h1 id="hero-title">
            کلمه‌ها را فقط حفظ نکن؛ <em>برای همیشه</em> یاد بگیر.
          </h1>
          <p>
            LearnBox با مرور هوشمند، جعبه لایتنر و همراهی BuBu، یادگیری زبان آلمانی را به یک عادت
            لذت‌بخش تبدیل می‌کند.
          </p>
          <div className="ctas">
            <button className="primary" onClick={() => unavailable('کافه بازار')}>
              دریافت از کافه بازار <Arrow />
            </button>
            <button className="secondary" onClick={() => unavailable('نسخه وب برای iPhone و iPad')}>
              نسخه وب
            </button>
          </div>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </div>
        <div className="world" aria-label="دنیای یادگیری LearnBox">
          <span className="card one" lang="de">
            der Beruf<small>شغل</small>
          </span>
          <span className="card two" lang="de">
            lernen<small>یاد گرفتن</small>
          </span>
          <div className="cube">
            <b>LB</b>
            <span>LearnBox</span>
          </div>
          <div className="trail" />
          <img
            className="bubu hero-bubu"
            src="/characters/BuBu/welcome-v2.png"
            alt="BuBu، همراه یادگیری LearnBox"
          />
        </div>
      </section>
      <section id="story" className="problem wrap" data-motion="forgetting">
        <div>
          <span>وقتی کلمه‌ها پراکنده‌اند</span>
        </div>
        <div>
          <h2>کلمه‌های زیادی یاد می‌گیری، اما چند روز بعد فراموششان می‌کنی؟</h2>
          <p>مشکل تو کم‌کاری نیست؛ مغز برای به‌یادسپاری به بازگشت در زمان مناسب نیاز دارد.</p>
        </div>
        <div className="scatter">
          <i lang="de" data-motion-item>
            die Wohnung
          </i>
          <i lang="de" data-motion-item>
            wichtig
          </i>
          <i lang="de" data-motion-item>
            der Termin
          </i>
          <img
            className="bubu"
            src="/characters/BuBu/recovery-v2.png"
            alt="BuBu در حال مرتب کردن واژه‌ها"
          />
        </div>
      </section>
      <section id="method" className="method" data-motion="leitner">
        <div className="wrap">
          <div className="intro">
            <span>روش LearnBox</span>
            <h2>هر واژه، دقیقاً وقتی برمی‌گردد که باید.</h2>
            <p>
              کارت‌های دشوار زودتر برمی‌گردند؛ کارت‌هایی که خوب می‌دانی، فضای بیشتری برای نفس‌کشیدن
              می‌گیرند.
            </p>
          </div>
          <ol className="steps">
            {[
              ['۱', 'واژهٔ تازه', 'ورود به مسیر یادگیری'],
              ['۲', 'مرور هوشمند', 'فاصله بر اساس پاسخ تو'],
              ['۳', 'تکرار مؤثر', 'تمرکز روی بخش سخت‌تر'],
              ['۴', 'ماندگاری', 'یادگیری در حافظه می‌ماند'],
            ].map(([n, t, d]) => (
              <li key={n} data-motion-item>
                <b>{n}</b>
                <strong>{t}</strong>
                <small>{d}</small>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="vocab wrap" data-motion="vocabulary">
        <article className="word">
          <header>
            <span>واژه امروز</span>
            <span lang="de">A1</span>
          </header>
          <h3 lang="de">die Wohnung</h3>
          <p>خانه / آپارتمان</p>
          <blockquote lang="de">Die Wohnung ist nah am Bahnhof.</blockquote>
          <footer>
            <span>مونث</span>
            <span>جمع: Wohnungen</span>
            <button aria-label="پخش تلفظ">◉</button>
          </footer>
        </article>
        <div>
          <span>فقط یک ترجمه نیست</span>
          <h2>واژه را در بافت، صدا و تصویرش یاد بگیر.</h2>
          <p>
            معنی فارسی، تلفظ، مثال کاربردی و نکته‌های ضروری در یک کارت آرام و قابل‌فهم کنار هم قرار
            می‌گیرند.
          </p>
        </div>
      </section>
      <section id="paths" className="paths">
        <div className="wrap">
          <div className="intro">
            <span>مسیر خودت را بساز</span>
            <h2>یادگیری برای جایی که می‌خواهی بروی.</h2>
          </div>
          <div className="picker" role="tablist">
            {paths.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={selected === p}
                onClick={() => setSelected(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="stage" data-motion="path-stage">
            <div className="path-copy" key={selected}>
              <small>مسیر انتخاب‌شده</small>
              <h3>{selected}</h3>
              <p>
                {selected.includes('مهاجرت')
                  ? 'واژه‌های کاربردی برای ساختن یک شروع مطمئن.'
                  : 'تمرین‌هایی نزدیک‌تر به هدف شخصی تو.'}
              </p>
            </div>
            <img className="bubu" src="/characters/BuBu/focus-v2.png" alt="BuBu در مسیر یادگیری" />
          </div>
        </div>
      </section>
      <section className="habit wrap" data-motion="habit">
        <img
          className="bubu"
          src="/characters/BuBu/celebrate-v2.png"
          alt="BuBu در حال جشن گرفتن پیشرفت"
        />
        <div>
          <span>عادت، نه فشار</span>
          <h2>هر روز یک موفقیت کوچک، یک قدم واقعی است.</h2>
          <p>
            هدف‌های روزانه، زنجیرهٔ یادگیری و واکنش‌های آرام BuBu کمک می‌کنند مسیر را ادامه بدهی؛
            بدون حس رقابت یا فشار بیهوده.
          </p>
          <ul>
            <li>مرور روزانه</li>
            <li>هدف هفتگی</li>
            <li>پیشرفت قابل‌دیدن</li>
          </ul>
        </div>
      </section>
      <section className="preview" data-motion="product">
        <div className="wrap">
          <div className="intro">
            <span>تجربهٔ واقعی محصول</span>
            <h2>یادگیری در جیب تو، روی مرورگر تو.</h2>
          </div>
          <div className="devices">
            <article className="phone">
              <small>امروز</small>
              <h3>۳ واژه برای مرور</h3>
              <div>
                <b lang="de">das Gespräch</b>
                <span>گفت‌وگو</span>
              </div>
              <button>شروع مرور</button>
            </article>
            <article className="laptop">
              <header>
                LearnBox <span>پیشرفت من</span>
              </header>
              <h3>آمادهٔ مرور امروز هستی؟</h3>
              <div className="chart">
                <i data-motion-item />
                <i data-motion-item />
                <i data-motion-item />
                <i data-motion-item />
                <i data-motion-item />
              </div>
            </article>
          </div>
        </div>
      </section>
      <section id="download" className="download wrap" data-motion="download">
        <div>
          <span>شروع کن</span>
          <h2>اولین کلمه، شروع یک مسیر تازه است.</h2>
          <p>
            از دستگاهی که در دسترس توست وارد شو. وضعیت انتشار هر مسیر همیشه شفاف و دقیق می‌ماند.
          </p>
        </div>
        <div className="options">
          <button onClick={() => unavailable('نسخه Android')}>
            <b>Android</b>
            <strong>دریافت از کافه بازار</strong>
            <small>به‌زودی پس از تأیید انتشار</small>
          </button>
          <button onClick={() => unavailable('نسخه وب')}>
            <b>iPhone، iPad و مرورگر</b>
            <strong>نسخه وب برای iPhone و iPad</strong>
            <small>نشانی نسخه وب در حال تکمیل است</small>
          </button>
        </div>
      </section>
      <section className="community wrap" data-motion="community">
        <div>
          <span>همراه هم</span>
          <h2>LearnBox را در هر جایی که یاد می‌گیری دنبال کن.</h2>
        </div>
        <div className="socials">
          {social.map(([n, d]) => (
            <article key={n}>
              <b>{n}</b>
              <p>{d}</p>
              <small>نشانی رسمی پس از تأیید ثبت می‌شود</small>
            </article>
          ))}
        </div>
      </section>
      <section
        id="finale"
        className="finale wrap"
        data-motion="finale"
        aria-labelledby="finale-title"
      >
        <div className="finale-world" aria-hidden="true">
          <span className="resolved-card resolved-one" lang="de">
            der Beruf
          </span>
          <span className="resolved-card resolved-two" lang="de">
            die Wohnung
          </span>
          <span className="resolved-card resolved-three" lang="de">
            lernen
          </span>
          <img className="bubu" src="/characters/BuBu/encourage-v2.png" alt="" />
        </div>
        <div>
          <span>ادامهٔ مسیر با توست</span>
          <h2 id="finale-title">اولین کلمه، شروع یک مسیر تازه است.</h2>
          <p>
            واژه‌ها این‌بار پراکنده نمی‌مانند؛ LearnBox زمان بازگشت هر کدام را به خاطر می‌سپارد.
          </p>
          <button className="primary" onClick={() => unavailable('شروع یادگیری')}>
            یادگیری را با BuBu شروع کن <Arrow />
          </button>
        </div>
      </section>
      <footer>
        <div className="wrap">
          <a className="brand" href="#top">
            <b>LB</b>
            <span>LearnBox</span>
          </a>
          <p>یادگیری آلمانی، آرام‌تر و ماندگارتر.</p>
          <small>© LearnBox</small>
        </div>
      </footer>
    </main>
  );
}
