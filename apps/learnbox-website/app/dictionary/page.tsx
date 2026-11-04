import type { Metadata } from 'next';
import { siteConfig } from '../../src/config/site.mjs';
import { stats, wordOfTheDay } from '../../src/dictionary/store';
import { wordHref } from '../../src/dictionary/href';
import { DictionaryHero } from './client';

export const metadata: Metadata = {
  title: 'دیکشنری آلمانی به فارسی رایگان',
  description:
    'معنی فارسی واژه‌های آلمانی با آرتیکل، جمع، صرف، تلفظ و جملهٔ نمونه. شکل صرف‌شده را هم پیدا می‌کند.',
  alternates: { canonical: '/dictionary' },
};

const faNum = (n: number) => n.toLocaleString('fa-IR');
const ARTC: Record<string, string> = { der: 'var(--der)', die: 'var(--die)', das: 'var(--das)' };

export default function DictionaryHome() {
  const { entries } = stats();
  const wotd = wordOfTheDay(new Date());
  const ex = wotd.examples.find((e) => e.fa);
  const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tehran',
  }).format(new Date());
  const download = siteConfig.destinations.cafeBazaar.url ?? '/#download';
  return (
    <>
      <DictionaryHero
        count={faNum(Math.floor(entries / 1000) * 1000)}
        hints={[
          { q: 'Termin' },
          { q: 'ging', label: 'شکل صرف‌شده' },
          { q: 'قرار', label: 'فارسی به آلمانی' },
          { q: 'Führerschein', label: 'واژهٔ مرکب' },
        ]}
      />

      <section className="sec wrap">
        <div className="wotd card seen">
          <div className="wotd-l">
            <span className="tag">واژهٔ امروز · {today}</span>
            <div className="word de">
              {wotd.article && (
                <span className="a" style={{ color: ARTC[wotd.article] }}>
                  {wotd.article}
                </span>
              )}{' '}
              {wotd.lemma}
            </div>
            <p style={{ fontSize: '1.3rem', color: '#fff', fontWeight: 700, margin: 0 }}>
              {wotd.fa}
            </p>
            {ex && (
              <p>
                <span className="de">„{ex.de}“</span>
                <br />
                {ex.fa}
              </p>
            )}
            <a
              className="btn btn-p"
              style={{ marginTop: 10, background: 'var(--sun)', color: 'var(--ink)' }}
              href={wordHref(wotd.lemma)}
            >
              ببین چطور به کار می‌رود
            </a>
          </div>
          <div className="wotd-r">
            <div className="ring" style={{ width: 380, height: 380 }}></div>
            <div
              className="ring"
              style={{ width: 250, height: 250, animationDirection: 'reverse' }}
            ></div>
            <img src="/themes/summer/bubu/progress-celebrate-v3.png" alt="" />
          </div>
        </div>
      </section>

      <section className="sec wrap" style={{ paddingTop: 0 }}>
        <div className="inapp">
          <div>
            <h2>واژه‌ها را فقط پیدا نکن، به خاطر بسپار</h2>
            <p className="lead">
              در اپ لرن‌باکس واژه‌ها با جعبهٔ لایتنر درست وقتی که در حال فراموش شدن هستند دوباره
              جلوی چشمت می‌آیند. واژه‌هایی که اینجا ذخیره می‌کنی روی همین دستگاه می‌مانند.
            </p>
            <a className="btn btn-p" href={download}>
              دانلود لرن‌باکس
            </a>
          </div>
          <div className="phone">
            <div className="screen">
              <div className="ttl">جست‌وجو</div>
              <div className="sbox">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span className="de" style={{ color: 'var(--ink)', fontWeight: 700 }}>
                  Term
                </span>
                <span
                  style={{
                    width: 2,
                    height: 22,
                    background: 'var(--purple)',
                    animation: 'blink 1s steps(1) infinite',
                  }}
                ></span>
              </div>
              <div className="grp">در دیکشنری</div>
              {[
                ['der', 'Termin', 'وقت ملاقات'],
                ['der', 'Terminkalender', 'تقویم'],
                ['das', 'Terminal', 'پایانه'],
              ].map(([a, w, f]) => (
                <div className="row" key={w} style={{ '--c': ARTC[a] } as React.CSSProperties}>
                  <span className="dot"></span>
                  <span className="de">
                    {a} {w}
                  </span>
                  <small>{f}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="wrap foot">
        <span>© لرن‌باکس</span>
        <span>
          داده‌ها:{' '}
          <a href="https://de.wiktionary.org" rel="noopener">
            Wiktionary
          </a>{' '}
          (CC BY-SA)،{' '}
          <a href="https://github.com/ckh/farhang" rel="noopener">
            farhang
          </a>{' '}
          (CC BY-SA)،{' '}
          <a href="https://tatoeba.org" rel="noopener">
            Tatoeba
          </a>{' '}
          (CC BY)
        </span>
      </footer>
    </>
  );
}
