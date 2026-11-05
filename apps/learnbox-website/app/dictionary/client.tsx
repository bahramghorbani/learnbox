'use client';

// Interactive parts of the dictionary. Markup, class names and motion are a one-to-one port of the
// locked design in docs/design/dictionary/index.html; behaviour comments name the mockup function.
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { wordHref } from '../../src/dictionary/href';
import type {
  Article,
  CompoundPart,
  Entry,
  Hit,
  NounTable,
  VerbTable,
} from '../../src/dictionary/store';

const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const ARTC: Record<string, string> = { der: 'var(--der)', die: 'var(--die)', das: 'var(--das)' };
const reduced = () =>
  typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- saved words (localStorage, no account) ---------------- */
const KEY = 'lbd-saved';
const readSaved = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};
function useSaved() {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSaved(readSaved());
    sync();
    addEventListener('lbd-saved', sync);
    addEventListener('storage', sync);
    return () => {
      removeEventListener('lbd-saved', sync);
      removeEventListener('storage', sync);
    };
  }, []);
  const toggle = useCallback((lemma: string) => {
    const cur = readSaved();
    const on = !cur.includes(lemma);
    const next = on ? [...cur, lemma] : cur.filter((w) => w !== lemma);
    localStorage.setItem(KEY, JSON.stringify(next));
    dispatchEvent(new Event('lbd-saved'));
    if (on && next.length === 10) setTimeout(() => dispatchEvent(new Event('lbd-sheet')), 900);
    return on;
  }, []);
  return { saved, toggle };
}

const DOWNLOAD = '/#download';

export function DictHeader() {
  const { saved, toggle } = useSaved();
  const home = usePathname() === '/dictionary';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ lemma: string; article: Article; fa: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    if (!saved.length) return setItems([]);
    fetch(`/dictionary/search?words=${encodeURIComponent(saved.join(','))}`)
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems(saved.map((lemma) => ({ lemma, article: null, fa: '' }))));
  }, [open, saved]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [open]);
  const n = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const el = n.current;
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }, [saved.length]);
  return (
    <header className="hdr">
      <a className="brand" href="/">
        <b>LB</b>
        <span>LearnBox</span>
      </a>
      <nav className="nav" aria-label="اصلی">
        <a href="/#method">روش یادگیری</a>
        <a href="/#paths">مسیرها</a>
        <a href="/dictionary" className="on" aria-current="page">
          دیکشنری
        </a>
        <a href="/#download">دانلود</a>
      </nav>
      <div className="hdr-actions">
        <button
          type="button"
          className="saved-pill"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 3h12v18l-6-4-6 4z" />
          </svg>
          <span className="lbl">ذخیره‌ها</span>{' '}
          <span className="n" ref={n}>
            {fa(saved.length)}
          </span>
        </button>
        <a className="btn btn-p" href={DOWNLOAD}>
          دانلود اپ
        </a>
      </div>
      {!home && (
        <form className="hsearch" action="/dictionary" role="search">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            name="q"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label="جست‌وجوی واژهٔ دیگر"
            placeholder="جست‌وجوی واژهٔ دیگر…"
          />
        </form>
      )}
      <div
        className={`saved-panel${open ? ' on' : ''}`}
        role="dialog"
        aria-label="واژه‌های ذخیره‌شده"
        aria-hidden={!open}
      >
        <button
          type="button"
          className="scrim"
          tabIndex={-1}
          aria-label="بستن"
          onClick={() => setOpen(false)}
        />
        <div className="sp-in">
          <div className="sp-h">
            <b>ذخیره‌های من</b>
            <small>{fa(saved.length)} واژه · فقط روی همین دستگاه</small>
            <button type="button" className="x" aria-label="بستن" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          {saved.length === 0 ? (
            <p className="sp-empty">
              هنوز واژه‌ای ذخیره نکرده‌ای. در صفحهٔ هر واژه دکمهٔ «ذخیره» را بزن تا اینجا بیاید.
            </p>
          ) : (
            <ul className="sp-list">
              {items.map((w) => (
                <li key={w.lemma}>
                  <a href={wordHref(w.lemma)} className="de">
                    {w.article && <em style={{ color: ARTC[w.article] }}>{w.article} </em>}
                    {w.lemma}
                  </a>
                  <small>{w.fa.split('، ')[0]}</small>
                  <button
                    type="button"
                    aria-label={`حذف ${w.lemma}`}
                    onClick={() => toggle(w.lemma)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a className="btn btn-p sp-cta" href={DOWNLOAD}>
            مرور با جعبهٔ لایتنر در اپ لرن‌باکس
          </a>
        </div>
      </div>
    </header>
  );
}

/** Word-of-the-day buttons: listen and save without leaving the home page. */
export function WotdActions({ lemma, audio }: { lemma: string; audio: string | null }) {
  const { saved, toggle } = useSaved();
  const on = saved.includes(lemma);
  const play = () => {
    const tts = () => {
      try {
        const u = new SpeechSynthesisUtterance(lemma);
        u.lang = 'de-DE';
        u.rate = 0.8;
        speechSynthesis.speak(u);
      } catch {
        // No speech engine available; nothing to play.
      }
    };
    if (!audio) return tts();
    new Audio(audio).play().catch(tts);
  };
  return (
    <div className="wotd2-actions">
      <button type="button" className="btn ghost" onClick={play}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        تلفظ
      </button>
      <button
        type="button"
        className={`btn ghost${on ? ' on' : ''}`}
        aria-pressed={on}
        onClick={() => toggle(lemma)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 3h12v18l-6-4-6 4z" />
        </svg>
        {on ? 'ذخیره شد' : 'ذخیره'}
      </button>
      <a className="btn btn-p sunny" href={wordHref(lemma)}>
        صفحهٔ کامل واژه
      </a>
    </div>
  );
}

export function SaveSheet({ href }: { href: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const open = () => setOn(true);
    addEventListener('lbd-sheet', open);
    return () => removeEventListener('lbd-sheet', open);
  }, []);
  return (
    <div
      className={`sheet${on ? ' on' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label="ذخیره‌ها"
    >
      <div className="sheet-in">
        <img src="/themes/summer/bubu/progress-celebrate-v3.png" alt="" />
        <b>۱۰ واژه ذخیره کردی! 🎉</b>
        <p>این واژه‌ها را در اپ لرن‌باکس با جعبهٔ لایتنر مرور کن تا برای همیشه در ذهنت بمانند.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            className="btn btn-p"
            href={href}
            style={{ background: 'var(--sun)', color: 'var(--ink)' }}
          >
            شروع در اپ
          </a>
          <button
            className="btn"
            style={{ background: '#ffffff1a', color: '#fff' }}
            onClick={() => setOn(false)}
          >
            بعداً
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- /dictionary ---------------- */
const SORTS: [string, string, number, number, number][] = [
  ['der', 'der', 8, 18, -8],
  ['Ä', '', 20, 64, 6],
  ['die', 'die', 86, 14, 7],
  ['ß', 'sun', 92, 58, -6],
  ['das', 'das', 4, 70, 5],
  ['Ü', 'paper', 74, 78, -4],
  ['W', '', 30, 10, 4],
  ['ö', 'paper', 66, 8, -7],
  ['sch', 'sun', 16, 44, -3],
  ['en', '', 84, 40, 8],
];

export function DictionaryHero({
  count,
  hints,
  initial = '',
}: {
  count: string;
  hints: { q: string; label?: string }[];
  initial?: string;
}) {
  const hero = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLDivElement>(null);
  const sorts = useRef<HTMLDivElement>(null);
  const q = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<{ head: string; hits: Hit[] } | null>(null);
  const [active, setActive] = useState(-1);
  const [focus, setFocus] = useState(false);
  const [placeholder, setPlaceholder] = useState('');
  const resRef = useRef<HTMLDivElement>(null);

  // hero parallax (mockup: pointermove on #hero)
  const onMove = (e: React.PointerEvent) => {
    if (reduced() || !hero.current || !sorts.current || !sky.current) return;
    const b = hero.current.getBoundingClientRect();
    const dx = (e.clientX - b.left) / b.width - 0.5;
    const dy = (e.clientY - b.top) / b.height - 0.5;
    sorts.current.querySelectorAll<HTMLElement>('.sort').forEach((s, i) => {
      const k = ((i % 3) + 1) * 14;
      s.style.setProperty('--x', `${-dx * k}px`);
      s.style.setProperty('--y', `${-dy * k}px`);
    });
    sky.current.style.transform = `scale(1.06) translate(${-dx * 10}px, ${-dy * 6}px)`;
  };

  // placeholder that teaches what you can type
  useEffect(() => {
    const PH = [
      'یک واژه بنویس… Termin',
      'شکل صرف‌شده هم می‌شود… ging',
      'یا به فارسی… قرار',
      `واژهٔ مرکب… ${hints[3]?.q ?? ''}`,
    ];
    let i = 0;
    let c = 0;
    let del = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (document.activeElement !== q.current && !q.current?.value) {
        const s = PH[i];
        c += del ? -1 : 1;
        setPlaceholder(s.slice(0, Math.max(0, c)));
        if (c === s.length + 12) del = true;
        if (del && c <= 0) {
          del = false;
          i = (i + 1) % PH.length;
        }
      }
      t = setTimeout(tick, del ? 22 : 60);
    };
    if (reduced()) setPlaceholder(PH[0]);
    else tick();
    return () => clearTimeout(t);
  }, [hints]);

  // live search, debounced
  useEffect(() => {
    const v = value.trim();
    if (!v) return setResult(null);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/dictionary/search?q=${encodeURIComponent(v)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((r: { head: string; hits: Hit[] }) => {
          setActive(-1);
          setResult(r);
          const el = resRef.current;
          if (el) {
            el.classList.remove('on');
            void el.offsetWidth;
          }
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [value]);

  // A search that stays empty for a few seconds is a word we are missing: tell the site once.
  useEffect(() => {
    const v = value.trim();
    if (!result || result.hits.length || !v || sentMisses.has(v.toLowerCase())) return;
    const t = setTimeout(() => {
      sentMisses.add(v.toLowerCase());
      sendFeedback({ type: 'miss', q: v });
    }, 2500);
    return () => clearTimeout(t);
  }, [result, value]);

  useEffect(() => {
    const slash = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== q.current) {
        e.preventDefault();
        q.current?.focus();
      }
    };
    addEventListener('keydown', slash);
    return () => removeEventListener('keydown', slash);
  }, []);

  const typeInto = async (text: string) => {
    q.current?.focus();
    if (reduced()) return setValue(text);
    let s = '';
    for (const ch of text) {
      s += ch;
      setValue(s);
      await new Promise((r) => setTimeout(r, 85));
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const n = result?.hits.length ?? 0;
    // Enter before the debounced results arrive: ask now, open the best match.
    if (e.key === 'Enter' && !n && value.trim()) {
      e.preventDefault();
      fetch(`/dictionary/search?q=${encodeURIComponent(value.trim())}`)
        .then((r) => r.json())
        .then((r: { head: string; hits: Hit[] }) =>
          r.hits[0] ? (location.href = wordHref(r.hits[0].lemma)) : setResult(r),
        )
        .catch(() => {});
      return;
    }
    if (!n) return;
    if (e.key === 'ArrowDown') setActive((a) => (a + 1) % n);
    else if (e.key === 'ArrowUp') setActive((a) => (a <= 0 ? n - 1 : a - 1));
    else if (e.key === 'Enter') location.href = wordHref(result!.hits[Math.max(0, active)].lemma);
    else return;
    e.preventDefault();
  };

  const k = value.trim().toLowerCase();
  const shown = Boolean(result) && Boolean(value.trim());
  return (
    <div className={`hero${shown ? ' gather' : ''}`} id="hero" ref={hero} onPointerMove={onMove}>
      <div className="hero-sky" id="sky" ref={sky} />
      <div className="sorts" id="sorts" ref={sorts} aria-hidden="true">
        {SORTS.map(([t, c, x, y, r], i) => (
          <span
            key={i}
            className={`sort ${c}`}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                '--x': '0px',
                '--y': '0px',
                '--r': `${r}deg`,
                '--d': `${4 + (i % 4)}s`,
                animationDelay: `-${i * 0.7}s`,
              } as React.CSSProperties
            }
          >
            {t}
          </span>
        ))}
      </div>
      <div className="wrap hero-in">
        <span className="eyebrow">
          <i></i>رایگان · بیش از {count} واژه · با تلفظ
        </span>
        <h1 className="big">
          هر واژهٔ آلمانی را{' '}
          <em>
            به فارسی
            <svg viewBox="0 0 300 22" preserveAspectRatio="none">
              <path d="M4 16 C 80 4, 200 4, 296 12" />
            </svg>
          </em>{' '}
          بفهم
        </h1>
        <p className="sub">
          معنی دقیق، آرتیکل، جمع، صرف و مثال واقعی؛ حتی اگر شکل صرف‌شده را بنویسی، مثل{' '}
          <span className="de">ging</span> یا <span className="de">Häuser</span>.
        </p>
        <div className={`search${focus ? ' focus' : ''}`} id="search">
          <label className="field">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="q"
              ref={q}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKey}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={shown}
              aria-controls="results"
              aria-activedescendant={active >= 0 ? `res-${active}` : undefined}
              aria-label="جست‌وجوی واژه به آلمانی یا فارسی"
              placeholder={placeholder}
            />
            <span className="kbd de">/</span>
          </label>
          <div className={`results${shown ? ' on' : ''}`} id="results" role="listbox" ref={resRef}>
            {result && !result.hits.length && (
              <div className="res-none">
                <b>
                  «<span className="de">{value.trim()}</span>» پیدا نشد
                </b>
                <span>
                  املای واژه را بررسی کن، شکل پایه را بنویس (مثلاً <span className="de">gehen</span>{' '}
                  به جای <span className="de">gegangen</span>) یا معنی فارسی‌اش را جست‌وجو کن.
                </span>
              </div>
            )}
            {result && result.hits.length > 0 && (
              <>
                <div className="res-h">{result.head}</div>
                {result.hits.map((h, i) => (
                  <a
                    key={h.lemma}
                    id={`res-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="res"
                    href={wordHref(h.lemma)}
                    style={
                      {
                        '--i': i,
                        ...(i === active ? { background: '#6c3ad60f' } : {}),
                      } as React.CSSProperties
                    }
                  >
                    <span
                      className="art de"
                      style={{ color: (h.article && ARTC[h.article]) || 'var(--muted)' }}
                    >
                      {h.article ?? ''}
                    </span>
                    <span className="w de">
                      {!h.via && k && h.lemma.toLowerCase().startsWith(k) ? (
                        <>
                          <mark>{h.lemma.slice(0, k.length)}</mark>
                          {h.lemma.slice(k.length)}
                        </>
                      ) : (
                        h.lemma
                      )}
                    </span>
                    {h.via && <span className="via">{h.via}</span>}
                    <span className="fa">{h.fa}</span>
                  </a>
                ))}
              </>
            )}
          </div>
          <div className="hints">
            {hints.map((h) => (
              <button key={h.q} className="hint" onClick={() => typeInto(h.q)}>
                {/[\u0600-\u06FF]/.test(h.q) ? h.q : <span className="de">{h.q}</span>}
                {h.label && <small>{h.label}</small>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- /dictionary/[word] ---------------- */
export type Quiz = { q: string; options: string[]; answer: number }[];
type Rel = { lemma: string; article: Article };

function underlineDiff(base: string, form: string) {
  let i = 0;
  while (i < base.length && i < form.length && base[i] === form[i]) i++;
  if (i === form.length || i < 2) return <>{form}</>;
  return (
    <>
      {form.slice(0, i)}
      <u>{form.slice(i)}</u>
    </>
  );
}

const sentMisses = new Set<string>();
function sendFeedback(body: Record<string, string>) {
  return fetch('/dictionary/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  })
    .then((r) => r.ok)
    .catch(() => false);
}

const reportOptions = [
  ['meaning', 'معنی درست نیست'],
  ['example', 'مثال اشتباه است'],
  ['article', 'حرف تعریف یا نوع کلمه اشتباه است'],
  ['other', 'چیز دیگری'],
] as const;

function ReportForm({ lemma }: { lemma: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>('meaning');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  if (state === 'sent')
    return (
      <p className="report-done" role="status">
        ممنون! گزارشت رسید و بررسی می‌شود.
      </p>
    );
  if (!open)
    return (
      <button type="button" className="report" onClick={() => setOpen(true)}>
        اشکالی دیدی؟ گزارش بده
      </button>
    );
  return (
    <form
      className="report-form"
      onSubmit={(e) => {
        e.preventDefault();
        setState('sending');
        void sendFeedback({ type: 'report', lemma, kind, note }).then((ok) =>
          setState(ok ? 'sent' : 'error'),
        );
      }}
    >
      <fieldset>
        <legend>چه اشکالی دیدی؟</legend>
        {reportOptions.map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="report-kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        توضیح (اختیاری)
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثلاً معنی درست را بنویس"
        />
      </label>
      {state === 'error' ? (
        <p className="report-error" role="alert">
          ارسال نشد؛ کمی بعد دوباره امتحان کن.
        </p>
      ) : null}
      <div className="report-actions">
        <button type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'در حال ارسال…' : 'ارسال گزارش'}
        </button>
        <button type="button" className="report" onClick={() => setOpen(false)}>
          انصراف
        </button>
      </div>
    </form>
  );
}

export function WordView({
  entry,
  quiz,
  family,
  synonyms,
  appHref,
}: {
  entry: Entry;
  quiz: Quiz;
  family: Rel[];
  synonyms: Rel[];
  appHref: string;
}) {
  const { saved, toggle } = useSaved();
  const isSaved = saved.includes(entry.lemma);
  const root = useRef<HTMLDivElement>(null);
  const [built, setBuilt] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const waveRef = useRef<HTMLSpanElement>(null);
  const bubu = useRef<HTMLImageElement>(null);
  const pack = useRef<HTMLDivElement>(null);
  const comp = useRef<HTMLDivElement>(null);

  // syllable index of each letter tile (mockup: syl-gap between Ter·min)
  const syl =
    entry.syllables && entry.syllables.join('').toLowerCase() === entry.lemma.toLowerCase()
      ? entry.syllables
      : [entry.lemma];
  const tiles: { c: string; s: number; gap: boolean }[] = [];
  syl.forEach((part, s) =>
    [...part].forEach((c, j) =>
      tiles.push({
        c: tiles.length < entry.lemma.length ? entry.lemma[tiles.length] : c,
        s,
        gap: s > 0 && j === 0,
      }),
    ),
  );

  // letter-drop + stamp (mockup: buildWord)
  useEffect(() => {
    const r = requestAnimationFrame(() => setBuilt(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const [stamped, setStamped] = useState(false);
  useEffect(() => {
    if (!built) return;
    const t = setTimeout(() => setStamped(true), 520);
    return () => clearTimeout(t);
  }, [built]);

  // scroll reveal (mockup: observeCards)
  const splitComp = useCallback(() => {
    const c = comp.current;
    if (!c) return;
    c.classList.remove('split');
    void c.offsetWidth;
    setTimeout(() => c.classList.add('split'), 120);
  }, []);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('seen');
          if (comp.current && e.target.contains(comp.current)) splitComp();
          io.unobserve(e.target);
        }),
      { threshold: 0.25 },
    );
    root.current?.querySelectorAll('.card').forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [splitComp]);

  // pronunciation: native recording when Wiktionary has one, else the browser voice
  const play = () => {
    if (playing) return;
    setPlaying(true);
    let dur = 1100;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const bars = [...(waveRef.current?.children ?? [])] as HTMLElement[];
      const weights = syl.map((p) => p.length);
      const total = weights.reduce((a, b) => a + b, 0);
      const t0 = performance.now();
      const anim = (t: number) => {
        const e = (t - t0) / dur;
        bars.forEach(
          (b, i) =>
            (b.style.height =
              6 +
              Math.abs(Math.sin(e * 9 + i * 0.6)) * 20 * Math.sin(Math.min(e, 1) * Math.PI) +
              'px'),
        );
        let acc = 0;
        const idx = weights.findIndex((w) => (acc += w) / total > e);
        setLit(e < 1 ? idx : null);
        if (e < 1) requestAnimationFrame(anim);
        else {
          setPlaying(false);
          bars.forEach((b) => (b.style.height = '6px'));
        }
      };
      requestAnimationFrame(anim);
    };
    const speak = () => {
      try {
        const u = new SpeechSynthesisUtterance(entry.lemma);
        u.lang = 'de-DE';
        u.rate = 0.8;
        speechSynthesis.speak(u);
      } catch {
        // No speech engine: the wave still plays so the button gives feedback.
      }
      start();
    };
    if (!entry.audio) return speak();
    const a = new Audio(entry.audio);
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration) && a.duration > 0.3) dur = Math.min(a.duration * 1000, 2500);
    };
    a.onplaying = start;
    a.play().catch(speak);
  };

  const sayDe = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      // No speech engine available; nothing to play.
    }
  };

  // declension/conjugation with sliding segment (mockup: decl)
  const isNoun = entry.table && 'singular' in entry.table;
  const segs: [string, string][] = isNoun
    ? [
        ['sg', 'مفرد'],
        ['pl', 'جمع'],
      ]
    : [
        ['present', 'حال'],
        ['past', 'گذشته'],
      ];
  const [seg, setSeg] = useState(segs[0][0]);
  const segRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<React.CSSProperties>({});
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    const btn = segRef.current?.querySelector<HTMLButtonElement>(`[data-n="${seg}"]`);
    if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [seg]);
  const [shownSeg, setShownSeg] = useState(seg);
  useEffect(() => {
    if (seg === shownSeg) return;
    setSwap(true);
    const t = setTimeout(() => {
      setShownSeg(seg);
      requestAnimationFrame(() => requestAnimationFrame(() => setSwap(false)));
    }, 180);
    return () => clearTimeout(t);
  }, [seg, shownSeg]);
  const CASES = ['نهادی', 'مفعولی', 'با واسطه', 'ملکی'];
  const cells: [string, React.ReactNode][] = [];
  if (entry.table && isNoun) {
    const t = entry.table as NounTable;
    (shownSeg === 'pl' ? t.plural : t.singular).forEach((c, i) => {
      if (c)
        cells.push([
          CASES[i],
          <>
            <u>{c[0]}</u> {underlineDiff(entry.lemma, c[1])}
          </>,
        ]);
    });
  } else if (entry.table) {
    const t = entry.table as VerbTable;
    const stem = entry.lemma.replace(/e?n$/, '');
    (shownSeg === 'past' ? t.past : t.present).forEach((c) => {
      if (c) cells.push([c[0], underlineDiff(stem, c[1])]);
    });
  }
  const declAc = isNoun
    ? shownSeg === 'pl'
      ? 'var(--die)'
      : (ARTC[entry.article ?? ''] ?? 'var(--purple)')
    : 'var(--purple)';

  // 3-question preview quiz (mockup: quiz, jump, burst)
  const [qi, setQi] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const [right, setRight] = useState<number | null>(null);
  const jump = () => {
    const b = bubu.current;
    if (!b) return;
    b.src = '/themes/summer/bubu/progress-celebrate-v3.png';
    b.classList.remove('jump');
    void b.offsetWidth;
    b.classList.add('jump');
    setTimeout(() => (b.src = '/themes/summer/bubu/learning-focus-v3.png'), 900);
  };
  const burst = (el: HTMLElement) => {
    if (reduced() || !pack.current) return;
    const r = el.getBoundingClientRect();
    const h = pack.current.getBoundingClientRect();
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      s.style.background = ['#ffd36a', '#fff', '#22c55e', '#f472b6'][i % 4];
      s.style.left = r.left - h.left + r.width / 2 + 'px';
      s.style.top = r.top - h.top + r.height / 2 + 'px';
      pack.current.appendChild(s);
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 60;
      s.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          {
            transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${Math.random() * 360}deg)`,
            opacity: 0,
          },
        ],
        { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.16,1,.3,1)' },
      ).onfinish = () => s.remove();
    }
  };
  const answer = (j: number, el: HTMLElement) => {
    if (right !== null) return;
    if (j === quiz[qi].answer) {
      setRight(j);
      burst(el);
      jump();
      setTimeout(() => {
        setRight(null);
        setWrong(null);
        setQi((i) => i + 1);
        if (qi + 1 >= quiz.length) jump();
      }, 900);
    } else {
      setWrong(null);
      requestAnimationFrame(() => setWrong(j));
    }
  };

  const art = entry.article;
  const hl = (text: string) => {
    const stem = entry.lemma.slice(0, Math.max(3, entry.lemma.length - 2)).toLowerCase();
    return text.split(/(\s+)/).map((w, i) =>
      w
        .toLowerCase()
        .replace(/^[„"(]/, '')
        .startsWith(stem) ? (
        <strong key={i}>{w}</strong>
      ) : (
        w
      ),
    );
  };
  const freqLabel = entry.freq >= 4 ? 'پرکاربرد' : entry.freq >= 2 ? 'متداول' : 'کم‌کاربرد';
  const pos = POS[entry.pos ?? ''] ?? null;

  return (
    <div className="wrap" ref={root}>
      <div className="crumbs">
        <a href="/dictionary">دیکشنری</a> /{' '}
        {pos && (
          <>
            <span>{pos}</span> /{' '}
          </>
        )}
        <span className="de">{entry.lemma}</span>
      </div>
      <div className="wgrid">
        <article>
          <div className="whero" id="whero">
            <div className="meta">
              {pos && <span className="chip">{pos}</span>}
              {entry.freq > 0 && (
                <span className="chip">
                  <span className="freq">
                    {[6, 9, 12, 14, 14].map((h, i) => (
                      <i key={i} className={i < entry.freq ? '' : 'off'} style={{ height: h }}></i>
                    ))}
                  </span>
                  {freqLabel}
                </span>
              )}
            </div>
            <div className="setline" id="setline">
              {art && (
                <div
                  className={`stamp${stamped ? ' in' : ''}`}
                  id="stamp"
                  style={{ '--ac': ARTC[art] } as React.CSSProperties}
                >
                  {art}
                </div>
              )}
              <h1 className="tiles" id="tiles" aria-label={`${art ? art + ' ' : ''}${entry.lemma}`}>
                {tiles.map((t, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className={`tile${t.gap ? ' syl-gap' : ''}${built ? ' in' : ''}${lit === t.s ? ' lit' : ''}`}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    {t.c}
                  </span>
                ))}
              </h1>
            </div>
            <svg
              className={`path${built ? ' in' : ''}`}
              id="path"
              viewBox="0 0 600 26"
              preserveAspectRatio="none"
            >
              <path d="M598 6 C 450 30, 300 -6, 160 14 S 30 20, 2 10" />
            </svg>
            <p className={`fa-main${built ? ' in' : ''}`} id="famain">
              {entry.fa}
            </p>
            {(entry.gram.length > 0 || syl.length > 1) && (
              <div className="gram">
                {entry.gram.map(([k, v]) => (
                  <span key={k}>
                    {k}: <b className="de">{v}</b>
                  </span>
                ))}
                {syl.length > 1 && (
                  <span>
                    هجا: <b className="de">{syl.join('·')}</b>
                  </span>
                )}
              </div>
            )}
            <div className="toolbar">
              <button
                className={`play${playing ? ' on' : ''}`}
                id="play"
                aria-label="پخش تلفظ"
                onClick={play}
              >
                <span className="wave" id="wave" ref={waveRef}>
                  {Array.from({ length: 18 }, (_, i) => (
                    <i key={i}></i>
                  ))}
                </span>
                {entry.ipa && <span className="ipa">{entry.ipa}</span>}
                <span className="pb">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
              <button
                className={`icon-btn save${isSaved ? ' on' : ''}`}
                id="save"
                aria-pressed={isSaved}
                aria-label="ذخیرهٔ واژه"
                onClick={() => toggle(entry.lemma)}
              >
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M6 3h12v18l-6-4-6 4z" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="save-label" id="saveLabel">
                {isSaved ? 'ذخیره شد' : 'ذخیره'}
              </span>
            </div>
          </div>

          <div className="card">
            <h2 className="h3">
              <span className="k">۱</span>معنی‌ها
            </h2>
            {entry.senses.map((s, i) => (
              <div className="sense" key={i}>
                <span className="no">{fa(i + 1)}</span>
                <div>
                  <b>{s.fa}</b>
                  {s.hint && (
                    <p>
                      هم‌معنی: <span className="de">{s.hint}</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(entry.examples.length > 0 || entry.phrases.length > 0) && (
            <div className="card">
              {entry.examples.length > 0 && (
                <>
                  <h2 className="h3">
                    <span className="k">۲</span>در جمله
                  </h2>
                  {entry.examples.map((x, i) => (
                    <div className="ex" key={i}>
                      <button className="say" aria-label="پخش جمله" onClick={() => sayDe(x.de)}>
                        ▶
                      </button>
                      <div className="g de">{hl(x.de)}</div>
                      {x.fa && <div className="f">{x.fa}</div>}
                    </div>
                  ))}
                </>
              )}
              {entry.phrases.length > 0 && (
                <>
                  <h2 className="h3" style={entry.examples.length ? { marginTop: 24 } : undefined}>
                    <span className="k">+</span>با این‌ها می‌آید
                  </h2>
                  <div className="colls">
                    {entry.phrases.slice(0, 6).map((p, i) => (
                      <span className="coll" key={i}>
                        <span className="de">{p.de}</span>
                        <small>{p.fa}</small>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {cells.length > 0 && (
            <div className="card">
              <h2 className="h3">
                <span className="k">۳</span>
                {isNoun ? 'صرف' : 'صرف فعل'}
              </h2>
              <div className="seg" id="seg" ref={segRef}>
                <span className="thumb" style={thumb}></span>
                {segs.map(([n, label]) => (
                  <button
                    key={n}
                    className={seg === n ? 'on' : ''}
                    data-n={n}
                    onClick={() => setSeg(n)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={`decl${swap ? ' swap' : ''}`} id="decl">
                {cells.map(([c, w]) => (
                  <div className="cell" key={c} style={{ '--ac': declAc } as React.CSSProperties}>
                    <small>{c}</small>
                    <span className="de">{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entry.compound && (
            <Compound parts={entry.compound} entry={entry} compRef={comp} onAgain={splitComp} />
          )}
        </article>

        <aside className="side">
          <div className="pack" id="pack" ref={pack}>
            <img
              className="bubu"
              id="bubu"
              ref={bubu}
              src="/themes/summer/bubu/learning-focus-v3.png"
              alt=""
            />
            <span className="t">با لرن‌باکس به خاطرش بسپار</span>
            <h4>یک تمرین کوتاه با همین واژه</h4>
            <div className="stat">{fa(quiz.length)} سؤال · کمتر از یک دقیقه</div>
            <div className="quiz" id="quiz">
              <div className="qdots">
                {quiz.map((_, j) => (
                  <i key={j} className={j < qi ? 'ok' : ''}></i>
                ))}
              </div>
              {qi >= quiz.length ? (
                <div className="done">
                  <b>
                    {fa(quiz.length)} از {fa(quiz.length)}! 🎉
                  </b>
                  <span>واژه‌های بیشتر مثل این، با مرور هوشمند، در اپ منتظرت است.</span>
                </div>
              ) : (
                <>
                  <div className="q">{quiz[qi].q}</div>
                  <div className="opts">
                    {quiz[qi].options.map((o, j) => (
                      <button
                        key={`${qi}-${j}`}
                        className={`opt${/[\u0600-\u06FF]/.test(o) ? '' : ' de'}${right === j ? ' right' : ''}${wrong === j ? ' wrong' : ''}`}
                        style={/[\u0600-\u06FF]/.test(o) ? undefined : { textAlign: 'left' }}
                        onClick={(e) => answer(j, e.currentTarget)}
                      >
                        {o}
                        <span className="xp">+۵</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <a className="btn cta" href={appHref}>
              شروع رایگان در اپ
            </a>
          </div>
          {(family.length > 0 || synonyms.length > 0) && (
            <div className="mini">
              {family.length > 0 && (
                <>
                  <h5>خانوادهٔ این واژه</h5>
                  <div className="rel">
                    {family.map((r) => (
                      <a key={r.lemma} className="de" href={wordHref(r.lemma)}>
                        {r.article ? `${r.article} ` : ''}
                        {r.lemma}
                      </a>
                    ))}
                  </div>
                </>
              )}
              {synonyms.length > 0 && (
                <>
                  <h5 style={family.length ? { marginTop: 18 } : undefined}>هم‌معنی</h5>
                  <div className="rel">
                    {synonyms.map((r) => (
                      <a key={r.lemma} className="de" href={wordHref(r.lemma)}>
                        {r.article ? `${r.article} ` : ''}
                        {r.lemma}
                      </a>
                    ))}
                  </div>
                </>
              )}
              <div style={{ marginTop: 18 }}>
                <ReportForm lemma={entry.lemma} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Compound({
  parts,
  entry,
  compRef,
  onAgain,
}: {
  parts: CompoundPart[];
  entry: Entry;
  compRef: React.RefObject<HTMLDivElement | null>;
  onAgain: () => void;
}) {
  const last = parts[parts.length - 1];
  return (
    <div className="card">
      <h2 className="h3">
        <span className="k">⧉</span>واژهٔ مرکب را باز کن
      </h2>
      <div className="comp" id="comp" ref={compRef}>
        {parts.map((p, i) => (
          <a
            className="part"
            key={i}
            href={wordHref(p.lemma)}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="blk de">{p.text}</div>
            <div className="m">
              <b>{p.fa}</b>
              <small className="de">
                {p.article ? `${p.article} ` : ''}
                {p.lemma}
              </small>
            </div>
          </a>
        ))}
      </div>
      <div className="comp-sum">
        <div className="eq">
          <span
            className="de"
            style={{ color: (entry.article && ARTC[entry.article]) || 'var(--ink)' }}
          >
            {entry.article ? `${entry.article} ` : ''}
            {entry.lemma}
          </span>{' '}
          = {entry.fa.split('، ')[0]}
        </div>
        {entry.article && last.article === entry.article && (
          <div className="rule">
            💡 آرتیکل واژهٔ مرکب را همیشه <u>آخرین جزء</u> تعیین می‌کند
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <button className="btn btn-g" id="compBtn" onClick={onAgain}>
          دوباره ببین
        </button>
      </div>
    </div>
  );
}

const POS: Record<string, string> = {
  noun: 'اسم',
  verb: 'فعل',
  adj: 'صفت',
  adv: 'قید',
  name: 'نام خاص',
  phrase: 'عبارت',
  prep: 'حرف اضافه',
  conj: 'حرف ربط',
  pron: 'ضمیر',
  num: 'عدد',
  intj: 'صوت',
  abbrev: 'اختصار',
  particle: 'ادات',
};
