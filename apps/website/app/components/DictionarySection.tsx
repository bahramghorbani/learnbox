import { useEffect, useRef, useState } from 'react';
import { toPersianDigits } from '../persian-digits';

type Article = 'der' | 'die' | 'das' | null;
type Hit = { lemma: string; article: Article; fa: string };
type SearchResult = { head: string; hits: Hit[] };

const ARTC: Record<string, string> = { der: '#3b82f6', die: '#ef4444', das: '#22c55e' };

/**
 * «در دیکشنری»: the vocabulary section inside the app's «واژه‌ها» page (owner-approved naming —
 * the page stays «واژه‌ها», this is a labelled section within it). Search hits the public
 * dictionary through /api/learner/dictionary/search (server-side proxy, no duplicated reader);
 * saving a word writes to dictionary_saved_words via /api/learner/saved-words. A word that is
 * already one of the learner's pack cards is skipped here — it already lives in the list above.
 */
export function DictionarySection({ ownedGerman }: { ownedGerman: Set<string> }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [saved, setSaved] = useState<Hit[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const loadSaved = async () => {
    setLoadingSaved(true);
    try {
      const listRes = await fetch('/api/learner/saved-words');
      if (!listRes.ok) return setSaved([]);
      const { lemmas } = (await listRes.json()) as { lemmas: string[] };
      if (!lemmas.length) return setSaved([]);
      const briefRes = await fetch(
        `/api/learner/dictionary/search?words=${encodeURIComponent(lemmas.join(','))}`,
      );
      const items = briefRes.ok ? ((await briefRes.json()) as Hit[]) : [];
      setSaved(
        lemmas.map((l) => items.find((i) => i.lemma === l) ?? { lemma: l, article: null, fa: '' }),
      );
    } catch {
      setSaved([]);
    }
    setLoadingSaved(false);
  };

  useEffect(() => {
    void loadSaved();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return setResult(null);
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const t = setTimeout(() => {
      fetch(`/api/learner/dictionary/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then(setResult)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const save = async (lemma: string) => {
    try {
      await fetch('/api/learner/saved-words', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lemma }),
      });
      await loadSaved();
    } catch {
      // Best-effort; the button stays clickable for a retry.
    }
  };

  const remove = async (lemma: string) => {
    setSaved((cur) => cur.filter((w) => w.lemma !== lemma));
    try {
      await fetch(`/api/learner/saved-words/remove?lemma=${encodeURIComponent(lemma)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      void loadSaved();
    }
  };

  const savedSet = new Set(saved.map((w) => w.lemma));
  const hits = (result?.hits ?? []).filter((h) => !ownedGerman.has(h.lemma.toLowerCase()));

  return (
    <section className="words-dictionary-section">
      <h2 className="words-dictionary-title">در دیکشنری</h2>
      <label className="words-v2-search">
        <span className="sr-only">جست‌وجو در دیکشنری</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جست‌وجوی هر واژهٔ آلمانی یا فارسی..."
        />
        <span aria-hidden="true">⌕</span>
      </label>

      {query.trim() && (
        <div className="words-dictionary-results">
          {result === null ? null : hits.length === 0 ? (
            <p className="words-v2-empty">واژه‌ای پیدا نشد.</p>
          ) : (
            hits.map((h) => (
              <div key={h.lemma} className="words-dictionary-row">
                <span className="words-v2-word-info">
                  {h.article && <em style={{ color: ARTC[h.article] }}>{h.article} </em>}
                  <strong lang="de" dir="ltr">
                    {h.lemma}
                  </strong>
                  <span className="words-v2-persian">{h.fa.split('، ')[0]}</span>
                </span>
                <button
                  type="button"
                  className="words-dictionary-save"
                  aria-pressed={savedSet.has(h.lemma)}
                  onClick={() => (savedSet.has(h.lemma) ? remove(h.lemma) : save(h.lemma))}
                >
                  {savedSet.has(h.lemma) ? 'ذخیره شد' : 'ذخیره'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {!query.trim() && (
        <div className="words-dictionary-saved">
          <p className="words-v2-count">{toPersianDigits(saved.length)} واژهٔ ذخیره‌شده</p>
          {!loadingSaved && saved.length === 0 ? (
            <p className="words-v2-empty">هنوز واژه‌ای از دیکشنری ذخیره نکرده‌ای.</p>
          ) : (
            saved.map((w) => (
              <div key={w.lemma} className="words-dictionary-row">
                <span className="words-v2-word-info">
                  {w.article && <em style={{ color: ARTC[w.article] }}>{w.article} </em>}
                  <strong lang="de" dir="ltr">
                    {w.lemma}
                  </strong>
                  <span className="words-v2-persian">{w.fa.split('، ')[0]}</span>
                </span>
                <button
                  type="button"
                  className="words-dictionary-save"
                  aria-label={`حذف ${w.lemma}`}
                  onClick={() => remove(w.lemma)}
                >
                  حذف
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
