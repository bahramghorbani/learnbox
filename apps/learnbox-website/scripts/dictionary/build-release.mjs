// Builds one immutable dictionary release (SQLite) from open sources. See ADR 0017.
//
//   node scripts/dictionary/build-release.mjs <data-dir> <out.sqlite>
//
// <data-dir> holds: raw/dewiktionary.jsonl.gz (kaikki German Wiktionary), farhang/farhang-master/*.txt,
// tatoeba/sentences.csv + tatoeba/links.csv. Runs offline, never on the server; it touches no database.
import { createReadStream, existsSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { createGunzip } from 'node:zlib';

// ---------- Persian text ----------
const HARAKAT = /[\u064B-\u0652\u0670]/g;
export function cleanFa(raw) {
  let s = raw
    .replace(HARAKAT, '')
    .replace(/[ىي]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
  // farhang was typed in a bidi editor: a trailing abbreviation dot often landed at the start.
  if (s.startsWith('.')) s = s.slice(1).trim() + '.';
  // "قطع کردن، توقف ک." — a one-letter abbreviation repeats the closest earlier verb with that letter.
  s = s.replace(/(^|[\s،])([آ-ی])\.(?=$|[\s،])/g, (m, pre, letter, offset) => {
    const verbs = s.slice(0, offset).match(/[آ-ی]+ن(?=$|[\s،.])/g) || [];
    const verb = verbs.reverse().find((v) => v.startsWith(letter));
    return verb ? pre + verb : m;
  });
  // Latin parentheticals are grammar tags or transliterations: "(plur.)", "(mere bāzi)".
  s = s.replace(/\([^()]*[A-Za-z][^()]*\)/g, ' ');
  s = balanceParens(
    s
      .replace(/\s+ـ\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return s
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*،\s*/g, '، ')
    .replace(/[.\s،]+$/, '')
    .trim();
}
// Bidi editing mirrored some brackets: "(بعد (ابعاد" means "بعد (ابعاد)".
export function balanceParens(s) {
  const count = (c) => s.split(c).length - 1;
  if (count('(') > count(')') && s.startsWith('(')) s = s.slice(1).trim();
  if (count(')') > count('(') && s.indexOf(')') < (s.indexOf('(') + 1 || Infinity))
    s = s.replace(')', ' (');
  while (count('(') > count(')')) s += ')';
  return count(')') > count('(') ? s.replace(/[()]/g, '') : s;
}
export const faKey = (s) => cleanFa(s).replace(/[\s\u200c]+/g, ' ');
export const deKey = (s) => s.normalize('NFC').toLowerCase();

// ---------- farhang ----------
const GENDER = { m: 'der', f: 'die', n: 'das' };
export function parseFarhangLine(line) {
  const at = line.indexOf(';');
  if (at < 0) return null;
  const sub = line.startsWith('- ');
  const de = line.slice(sub ? 2 : 0, at).trim();
  const fa = cleanFa(line.slice(at + 1));
  return { sub, de, fa };
}
function readFarhang(dir) {
  const entries = new Map(); // lemma -> { article, senses: [{fa, hint}], phrases: [{de, fa}] }
  for (const file of readdirSync(dir)
    .filter((f) => /^[a-z]\.txt$/.test(f))
    .sort()) {
    let cur = null;
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      const p = parseFarhangLine(line.trim());
      if (!p) continue;
      if (!p.sub) {
        const g = p.de.match(/\((m|f|n)\)/);
        const lemma = p.de.replace(/\s*\(.*?\)\s*/g, ' ').trim();
        if (!lemma || /\s{2}|[;]/.test(lemma)) {
          cur = null;
          continue;
        }
        cur = entries.get(lemma) || { article: null, senses: [], phrases: [] };
        if (g) cur.article = GENDER[g[1]];
        if (p.fa) cur.senses.push({ fa: p.fa, hint: '' });
        entries.set(lemma, cur);
      } else if (cur && p.fa) {
        cur.phrases.push({ de: p.de.replace(/(^|\s)s\.(?=\s)/g, '$1sich'), fa: p.fa });
      }
    }
  }
  // A sub-line whose German is a synonym list starting with the headword is a sense, not a phrase.
  for (const [lemma, e] of entries) {
    const keep = [];
    for (const ph of e.phrases) {
      const parts = ph.de.split(',').map((x) => x.replace(/\(.*?\)/g, '').trim());
      if (parts[0] === lemma && parts.every((x) => x && !x.includes(' ')))
        e.senses.push({ fa: ph.fa, hint: parts.slice(1).join(', ') });
      else keep.push(ph);
    }
    e.phrases = keep;
  }
  return entries;
}

// ---------- Wiktionary ----------
async function* jsonl(path) {
  const rl = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) if (line) yield JSON.parse(line);
}
const PRONOUN = /^(ich|du|er\/sie\/es|er|sie|es|wir|ihr|Sie|man) /;
function cleanExample(t) {
  const s = t.replace(/^„|“$/g, '').trim();
  return s.length <= 110 && !/[[\]{}]/.test(s) ? s : null;
}
function nounTable(forms) {
  const pick = (c, n) => forms.find((f) => f.tags?.includes(c) && f.tags?.includes(n));
  const table = {};
  for (const n of ['singular', 'plural']) {
    table[n] = ['nominative', 'accusative', 'dative', 'genitive'].map((c) => {
      const f = pick(c, n);
      return f ? [f.article || '', f.form] : null;
    });
  }
  return table.singular.some(Boolean) ? table : null;
}
function verbTable(forms) {
  const persons = [
    ['first-person', 'singular', 'ich'],
    ['second-person', 'singular', 'du'],
    ['third-person', 'singular', 'er/sie/es'],
    ['first-person', 'plural', 'wir'],
    ['second-person', 'plural', 'ihr'],
    ['third-person', 'plural', 'sie/Sie'],
  ];
  const row = (tense) =>
    persons.map(([p, n, label]) => {
      const f = forms.find(
        (x) =>
          x.tags?.includes(p) &&
          x.tags?.includes(n) &&
          x.tags?.includes(tense) &&
          x.tags?.includes('indicative') &&
          x.tags?.includes('active'),
      );
      return f ? [label, f.form.replace(PRONOUN, '')] : null;
    });
  const present = row('present');
  return present.some(Boolean) ? { present, past: row('past') } : null;
}
function inflectedForms(entry) {
  const out = new Set();
  for (const f of entry.forms || []) {
    if (f.tags?.some((t) => ['variant', 'auxiliary'].includes(t))) continue;
    const w = f.form.replace(PRONOUN, '').replace(/!$/, '').trim();
    if (w && !w.includes(' ') && !w.includes('…')) out.add(w);
  }
  return out;
}

// ---------- build ----------
export async function build(dataDir, outPath) {
  const farhang = readFarhang(join(dataDir, 'farhang/farhang-master'));
  const wikt = new Map(); // lemma -> [entries]
  const formOf = new Map(); // inflected word -> Set(lemma)  (from form-of entries)
  const allLemmas = new Set();
  const compoundEty = new Map(); // every lemma whose etymology names its parts, with or without Persian
  for await (const d of jsonl(join(dataDir, 'raw/dewiktionary.jsonl.gz'))) {
    if (d.lang_code !== 'de') continue;
    if (d.tags?.includes('form-of')) {
      for (const s of d.senses || [])
        for (const f of s.form_of || []) {
          if (!formOf.has(d.word)) formOf.set(d.word, new Set());
          formOf.get(d.word).add(f.word);
        }
      continue;
    }
    allLemmas.add(d.word);
    // farhang predates the 1996 spelling reform (Strasse); file it under Wiktionary's Straße.
    const old = d.word.includes('ß') ? d.word.replace(/ß/g, 'ss') : null;
    if (old && farhang.has(old) && !farhang.has(d.word)) {
      farhang.set(d.word, farhang.get(old));
      farhang.delete(old);
    }
    const ety = d.etymology_texts?.[0];
    if (ety && /kompositum aus/i.test(ety) && !compoundEty.has(d.word))
      compoundEty.set(d.word, ety);
    const fa = (d.translations || []).filter((t) => t.lang_code === 'fa');
    if (!farhang.has(d.word) && !fa.length) continue;
    if (!wikt.has(d.word)) wikt.set(d.word, []);
    wikt.get(d.word).push(d);
  }

  // Headwords: every lemma with at least one Persian meaning.
  const heads = new Map();
  for (const lemma of new Set([...farhang.keys(), ...wikt.keys()])) {
    const fh = farhang.get(lemma);
    const ws = wikt.get(lemma) || [];
    const w =
      (fh?.article && ws.find((x) => x.pos === 'noun')) ||
      ws.find((x) => x.pos !== 'name') ||
      ws[0];
    // A meaning both sources agree on leads (Wiktionary alone put Schule → «کتاب», Bus →
    // «گذرگاه» first); then Wiktionary's sense-tied Persian, then farhang's breadth.
    const wk = [];
    for (const t of ws.flatMap((x) => x.translations || []).filter((t) => t.lang_code === 'fa')) {
      const f = cleanFa(t.word.replace(/,/g, '،'));
      if (f && !wk.some((s) => faKey(s.fa).includes(faKey(f)))) wk.push({ fa: f, hint: '' });
    }
    const fs = (fh?.senses || []).filter((s) => s.fa);
    const agreed = (x) =>
      fs.some((y) =>
        faKey(y.fa)
          .split('،')
          .some((p) => p.trim() && faKey(x.fa).includes(p.trim())),
      );
    const senses = [];
    for (const x of [...wk.filter(agreed), ...wk, ...fs])
      if (!senses.some((s) => faKey(s.fa) === faKey(x.fa))) senses.push({ ...x });
    for (const x of senses)
      x.fa = x.fa
        .replace(/<[^>]*>|;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    senses.splice(0, senses.length, ...senses.filter((x) => /[\u0600-\u06FF]/.test(x.fa)));
    if (!senses.length) continue;
    const forms = w?.forms || [];
    const nom = forms.find((f) => f.tags?.includes('nominative') && f.tags?.includes('singular'));
    const article =
      w?.pos === 'noun'
        ? nom?.article ||
          fh?.article ||
          GENDER[
            { masculine: 'm', feminine: 'f', neuter: 'n' }[
              w.tags?.find((t) => /culine|inine|neuter/.test(t))
            ]
          ] ||
          null
        : fh?.article || null;
    const sound = w?.sounds || [];
    heads.set(lemma, {
      lemma,
      pos: w?.pos || (article ? 'noun' : null),
      article,
      ipa: sound.find((s) => s.ipa)?.ipa || null,
      audio:
        sound.find((s) => s.mp3_url?.startsWith('https://upload.wikimedia.org/'))?.mp3_url || null,
      syllables: w?.hyphenations?.[0]?.parts || null,
      senses: senses.slice(0, 6),
      phrases: (fh?.phrases || []).slice(0, 8),
      table: w?.pos === 'noun' ? nounTable(forms) : w?.pos === 'verb' ? verbTable(forms) : null,
      gram: gramLine(w, forms),
      deExamples: (w?.senses || [])
        .flatMap((s) => (s.examples || []).map((e) => cleanExample(e.text)))
        .filter(Boolean)
        .slice(0, 2),
      synonyms: [...new Set((w?.synonyms || []).map((s) => s.word))].slice(0, 8),
      family: [...new Set((w?.derived || []).map((s) => s.word))].slice(0, 12),
      forms: w ? inflectedForms(w) : new Set(),
    });
  }

  // Inflected form -> headword
  const formIndex = new Map();
  const addForm = (form, lemma, note) => {
    if (form === lemma || !heads.has(lemma)) return;
    if (!formIndex.has(form)) formIndex.set(form, new Map());
    if (!formIndex.get(form).has(lemma)) formIndex.get(form).set(lemma, note);
  };
  for (const h of heads.values()) for (const f of h.forms) addForm(f, h.lemma, '');
  for (const [form, lemmas] of formOf) for (const l of lemmas) addForm(form, l, '');

  // Tatoeba: German–Persian pairs + corpus frequency
  const { pairs, freq } = await readTatoeba(join(dataDir, 'tatoeba'), heads, formIndex);
  const ranked = [...heads.keys()].sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0));
  const band = new Map(
    ranked.map((l, i) => [
      l,
      (freq.get(l) || 0) === 0 ? 0 : i < 1000 ? 5 : i < 3000 ? 4 : i < 7000 ? 3 : i < 14000 ? 2 : 1,
    ]),
  );

  if (existsSync(outPath)) rmSync(outPath);
  const db = new DatabaseSync(outPath);
  db.exec(`
    PRAGMA journal_mode = OFF; PRAGMA page_size = 4096;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entry (lemma TEXT PRIMARY KEY, article TEXT, pos TEXT, fa TEXT NOT NULL, freq INTEGER NOT NULL, data TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE form (form TEXT NOT NULL, lemma TEXT NOT NULL, PRIMARY KEY (form, lemma)) WITHOUT ROWID;
    CREATE VIRTUAL TABLE search USING fts5(lemma UNINDEXED, de, fa, tokenize = 'trigram remove_diacritics 1');
  `);
  const insEntry = db.prepare('INSERT INTO entry VALUES (?, ?, ?, ?, ?, ?)');
  const insForm = db.prepare('INSERT OR IGNORE INTO form VALUES (?, ?)');
  const insSearch = db.prepare('INSERT INTO search VALUES (?, ?, ?)');
  const stats = {
    entries: 0,
    withAudio: 0,
    withIpa: 0,
    withTable: 0,
    withFaExample: 0,
    withCompound: 0,
    forms: 0,
  };
  db.exec('BEGIN');
  for (const h of heads.values()) {
    const examples = (pairs.get(h.lemma) || []).slice(0, 2);
    const compound = splitCompound(h.lemma, compoundEty, heads, allLemmas);
    const data = {
      ipa: h.ipa,
      audio: h.audio,
      syllables: h.syllables,
      senses: h.senses,
      phrases: h.phrases,
      table: h.table,
      gram: h.gram,
      examples: examples.length ? examples : h.deExamples.map((de) => ({ de, fa: null })),
      synonyms: h.synonyms,
      family: h.family,
      compound,
    };
    insEntry.run(
      h.lemma,
      h.article,
      h.pos,
      h.senses[0].fa,
      band.get(h.lemma),
      JSON.stringify(data),
    );
    insSearch.run(h.lemma, h.lemma, h.senses.map((s) => faKey(s.fa)).join(' | '));
    stats.entries++;
    if (h.audio) stats.withAudio++;
    if (h.ipa) stats.withIpa++;
    if (h.table) stats.withTable++;
    if (examples.length) stats.withFaExample++;
    if (compound) stats.withCompound++;
  }
  for (const [form, lemmas] of formIndex)
    for (const lemma of lemmas.keys()) {
      insForm.run(form, lemma);
      stats.forms++;
    }
  const sources =
    'Wiktionary (CC BY-SA 4.0) via kaikki.org; farhang by ckh (CC BY-SA 3.0); Tatoeba (CC BY 2.0 FR)';
  for (const [k, v] of Object.entries({
    built_at: new Date().toISOString(),
    sources,
    stats: JSON.stringify(stats),
  }))
    db.prepare('INSERT INTO meta VALUES (?, ?)').run(k, v);
  db.exec("COMMIT; INSERT INTO search(search) VALUES ('optimize'); VACUUM;");
  db.close();
  const sha256 = createHash('sha256').update(readFileSync(outPath)).digest('hex');
  const report = { ...stats, bytes: statSync(outPath).size, sha256 };
  writeFileSync(`${outPath}.report.json`, JSON.stringify(report, null, 2) + '\n');
  return report;
}

function gramLine(w, forms) {
  if (!w) return [];
  const find = (...tags) => forms.find((f) => tags.every((t) => f.tags?.includes(t)));
  const out = [];
  if (w.pos === 'noun') {
    const pl = find('nominative', 'plural');
    const gen = find('genitive', 'singular');
    if (pl) out.push(['جمع', `${pl.article || 'die'} ${pl.form}`]);
    if (gen) out.push(['ملکی', `${gen.article || 'des'} ${gen.form}`]);
  } else if (w.pos === 'verb') {
    const past = find('past');
    const part = find('participle-2');
    const aux = find('auxiliary');
    if (past) out.push(['گذشته', past.form]);
    if (part) out.push(['اسم مفعول', `${aux?.form === 'sein' ? 'ist' : 'hat'} ${part.form}`]);
  } else if (w.pos === 'adj') {
    const comp = find('comparative');
    const sup = find('superlative');
    if (comp) out.push(['تفضیلی', comp.form]);
    if (sup) out.push(['عالی', sup.form]);
  }
  return out;
}

// "Determinativkompositum aus den Substantiven Haustür und Schlüssel" -> Haus | tür | schlüssel
export function splitCompound(lemma, compoundEty, heads, allLemmas, depth = 0) {
  const m = compoundEty.get(lemma)?.match(/kompositum aus (.+)$/i);
  if (!m || depth > 2) return null;
  const named = m[1]
    .replace(/\(.*?\)/g, '')
    .split(/,| und | sowie /)
    .map((x) =>
      x
        .trim()
        .split(/\s+/)
        .pop()
        ?.replace(/[^\p{L}-]/gu, ''),
    )
    .filter((x) => x && allLemmas.has(x));
  if (named.length < 2) return null;
  const parts = [];
  for (const p of named) {
    const sub = heads.get(p);
    const inner = splitCompound(p, compoundEty, heads, allLemmas, depth + 1);
    if (inner) parts.push(...inner.map((x) => ({ lemma: x.lemma, article: x.article, fa: x.fa })));
    else if (sub)
      parts.push({ lemma: p, article: sub.article, fa: sub.senses[0].fa.split('، ')[0] });
    else return null;
  }
  // The parts must spell the word in order, allowing a linking element (s, es, n, en, e, er) between them.
  let rest = deKey(lemma);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const key = deKey(parts[i].lemma.replace(/-$/, ''));
    const stem = key.replace(/e$/, '');
    const hit = rest.startsWith(key)
      ? key
      : rest.startsWith(stem) && i < parts.length - 1
        ? stem
        : null;
    if (!hit) return null;
    let take = hit.length;
    if (i < parts.length - 1) {
      const next = deKey(parts[i + 1].lemma).slice(0, 2);
      const link = ['es', 'en', 'er', 's', 'n', 'e'].find(
        (l) => rest.slice(take).startsWith(l) && rest.slice(take + l.length).startsWith(next),
      );
      if (link) take += link.length;
    }
    out.push({
      ...parts[i],
      text: lemma.slice(lemma.length - rest.length, lemma.length - rest.length + take),
    });
    rest = rest.slice(take);
  }
  return rest === '' ? out : null;
}

async function readTatoeba(dir, heads, formIndex) {
  const lang = new Map();
  const de = new Map();
  const fa = new Map();
  const freq = new Map();
  const tokenLemmas = (text) => {
    const found = new Set();
    for (const t of text.match(/[\p{L}ß-]+/gu) || []) {
      for (const cand of [t, t[0].toUpperCase() + t.slice(1), t.toLowerCase()]) {
        if (heads.has(cand)) found.add(cand);
        for (const l of formIndex.get(cand)?.keys() || []) found.add(l);
      }
    }
    return found;
  };
  const rl = createInterface({
    input: createReadStream(join(dir, 'sentences.csv')),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const [id, code, text] = line.split('\t');
    if (code === 'deu') {
      de.set(id, text);
      for (const l of tokenLemmas(text)) freq.set(l, (freq.get(l) || 0) + 1);
    } else if (code === 'pes') fa.set(id, text);
    if (code === 'deu' || code === 'pes') lang.set(id, code);
  }
  const pairs = new Map();
  const rl2 = createInterface({
    input: createReadStream(join(dir, 'links.csv')),
    crlfDelay: Infinity,
  });
  for await (const line of rl2) {
    const [a, b] = line.split('\t');
    if (lang.get(a) !== 'deu' || lang.get(b) !== 'pes') continue;
    const text = de.get(a);
    const words = text.split(/\s+/).length;
    if (words < 3 || words > 12) continue;
    for (const l of tokenLemmas(text)) {
      if (!pairs.has(l)) pairs.set(l, []);
      const list = pairs.get(l);
      if (list.length < 4 && !list.some((p) => p.de === text))
        list.push({ de: text, fa: cleanFa(fa.get(b)) });
    }
  }
  for (const list of pairs.values()) list.sort((x, y) => x.de.length - y.de.length);
  return { pairs, freq };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dataDir, outPath] = process.argv.slice(2);
  if (!dataDir || !outPath) {
    console.error('usage: build-release.mjs <data-dir> <out.sqlite>');
    process.exit(2);
  }
  console.log(JSON.stringify(await build(dataDir, outPath), null, 2));
}
