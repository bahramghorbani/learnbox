import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { StoreBadges } from '../components/landing/StoreBadges';
import { brief, isSpelling, search, stats, wordOfTheDay } from '../../src/dictionary/store';
import { wordHref } from '../../src/dictionary/href';
import { DictionaryHero, WotdActions } from './client';

export const metadata: Metadata = {
  title: 'دیکشنری آلمانی به فارسی رایگان',
  description:
    'معنی فارسی واژه‌های آلمانی با آرتیکل، جمع، صرف، تلفظ و جملهٔ نمونه. شکل صرف‌شده را هم پیدا می‌کند.',
  alternates: { canonical: '/dictionary' },
};

const faNum = (n: number) => n.toLocaleString('fa-IR');
const ARTC: Record<string, string> = { der: 'var(--der)', die: 'var(--die)', das: 'var(--das)' };

// Everyday words for the "popular" grid; brief() drops any that a data release lacks.
const POPULAR = [
  'Termin',
  'Wohnung',
  'Arbeit',
  'Zeit',
  'Geld',
  'Freund',
  'Familie',
  'Schule',
  'Arzt',
  'Bahnhof',
  'Rechnung',
  'Miete',
  'Versicherung',
  'Wasser',
  'Brot',
  'Hunger',
  'gehen',
  'kaufen',
  'sprechen',
  'verstehen',
  'arbeiten',
  'wohnen',
  'schön',
  'müde',
];

type Props = { searchParams: Promise<{ q?: string }> };

export default async function DictionaryHome({ searchParams }: Props) {
  // /dictionary?q=… (header search, Enter without JS): open the word if it is unambiguous.
  const q = ((await searchParams).q ?? '').trim().slice(0, 40);
  if (q) {
    const { hits } = search(q, 2);
    const top = hits[0];
    if (top && (hits.length === 1 || top.via || isSpelling(q, top.lemma)))
      redirect(wordHref(top.lemma));
  }
  const popular = brief(POPULAR);
  const { entries } = stats();
  const wotd = wordOfTheDay(new Date());
  const ex = wotd.examples.find((e) => e.fa);
  const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tehran',
  }).format(new Date());
  return (
    <>
      <DictionaryHero
        initial={q}
        count={faNum(Math.floor(entries / 1000) * 1000)}
        hints={[
          { q: 'Termin' },
          { q: 'ging', label: 'شکل صرف‌شده' },
          { q: 'قرار', label: 'فارسی به آلمانی' },
          { q: 'Führerschein', label: 'واژهٔ مرکب' },
        ]}
      />

      <section className="sec wrap" aria-labelledby="wotd-h">
        <div className="wotd2">
          <div className="wotd2-copy">
            <span className="tag" id="wotd-h">
              واژهٔ امروز · {today}
            </span>
            <a className="word de" href={wordHref(wotd.lemma)}>
              {wotd.article && (
                <span className="a" style={{ color: ARTC[wotd.article] }}>
                  {wotd.article}
                </span>
              )}
              {wotd.lemma}
            </a>
            {wotd.ipa && <span className="ipa de">{wotd.ipa}</span>}
            <p className="mean">{wotd.fa}</p>
            {ex && (
              <blockquote>
                <span className="de">„{ex.de}“</span>
                {ex.fa}
              </blockquote>
            )}
            <WotdActions lemma={wotd.lemma} audio={wotd.audio} />
          </div>
          <div className="wotd2-art" aria-hidden="true">
            <span className="glow"></span>
            <span className="bubble de">{wotd.lemma}!</span>
            {[...wotd.lemma.slice(0, 3)].map((ch, i) => (
              <span key={i} className={`chip c${i} de`}>
                {ch}
              </span>
            ))}
            <Image
              className="bubu"
              src="/themes/summer/bubu-themed/v1/language-coach.png"
              alt=""
              width={1024}
              height={1536}
              sizes="(max-width: 980px) 220px, 300px"
            />
          </div>
        </div>
      </section>

      <section className="sec wrap app2-sec" id="app" aria-labelledby="app-h">
        <div className="app2">
          <div className="app2-copy">
            <span className="eyebrow2">دیکشنری + اپ لرن‌باکس</span>
            <h2 id="app-h">
              پیدا کردن واژه، شروع کار است.
              <br />
              <em>به خاطر سپردنش با لرن‌باکس.</em>
            </h2>
            <ol className="steps">
              <li>
                <b>۱</b>
                <div>
                  <strong>جست‌وجو کن</strong>
                  <span>این دیکشنری برای همه رایگان و بدون محدودیت است.</span>
                </div>
              </li>
              <li>
                <b>۲</b>
                <div>
                  <strong>نشانش کن</strong>
                  <span>با دکمهٔ ذخیره، واژه در فهرست «ذخیره‌ها» بالای صفحه می‌ماند.</span>
                </div>
              </li>
              <li>
                <b>۳</b>
                <div>
                  <strong>در اپ مرورش کن</strong>
                  <span>
                    جعبهٔ لایتنر لرن‌باکس هر واژه را درست پیش از فراموش شدن دوباره جلوی چشمت
                    می‌آورد.
                  </span>
                </div>
              </li>
            </ol>
            <StoreBadges variant="download" />
          </div>
          <div className="leitner2" aria-hidden="true">
            <div className="boxes">
              {['امروز', '۱ روز', '۳ روز', '۷ روز', 'ماندگار'].map((t, i) => (
                <div key={t} className={`box b${i}`}>
                  <small>{t}</small>
                  <i>{faNum(i + 1)}</i>
                </div>
              ))}
            </div>
            <span className="hop de">
              <em style={{ color: ARTC[wotd.article ?? 'der'] }}>{wotd.article}</em> {wotd.lemma}
            </span>
            <Image
              className="bubu"
              src="/themes/summer/bubu-themed/v1/card-organizer.png"
              alt=""
              width={1024}
              height={1536}
              sizes="200px"
            />
          </div>
        </div>
      </section>

      {popular.length > 0 && (
        <section className="sec wrap pop-sec" aria-labelledby="pop-h">
          <h2 id="pop-h">واژه‌های پرکاربرد روزمره</h2>
          <p className="lead">از همین‌ها شروع کن؛ هر کدام صفحهٔ کامل با تلفظ، صرف و مثال دارد.</p>
          <ul className="pop">
            {popular.map((w, i) => (
              <li key={w.lemma} style={{ '--i': i } as React.CSSProperties}>
                <a href={wordHref(w.lemma)}>
                  <span className="de">
                    {w.article && <em style={{ color: ARTC[w.article] }}>{w.article} </em>}
                    {w.lemma}
                  </span>
                  <small>{w.fa.split('، ')[0]}</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

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
