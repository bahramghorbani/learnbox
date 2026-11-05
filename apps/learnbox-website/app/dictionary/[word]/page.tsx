import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { siteConfig } from '../../../src/config/site.mjs';
import {
  distractors,
  existing,
  getEntry,
  resolveLemma,
  type Entry,
  storedSpelling,
} from '../../../src/dictionary/store';
import { ldJson } from '../../../src/seo/sitemap';
import { wordHref } from '../../../src/dictionary/href';
import { WordView, type Quiz } from '../client';

type Props = { params: Promise<{ word: string }> };

function load(raw: string): Entry {
  const word = decodeURIComponent(raw).normalize('NFC');
  // ~200 headwords are stored (partly) decomposed in the source data; URLs always arrive as NFC.
  const stored = getEntry(word) ? null : storedSpelling(word);
  const entry = getEntry(stored ?? word);
  if (entry) return entry;
  // ging -> gehen, termin -> Termin: one canonical page per headword.
  const lemma = resolveLemma(word);
  if (lemma) permanentRedirect(wordHref(lemma));
  notFound();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = load((await params).word);
  const head = `${e.article ? e.article + ' ' : ''}${e.lemma}`;
  const title = `${head} به فارسی: ${e.fa.split('، ')[0]}`;
  const description = [
    `معنی ${head} به فارسی: ${e.senses
      .map((s) => s.fa)
      .slice(0, 3)
      .join('؛ ')}.`,
    e.gram.map(([k, v]) => `${k}: ${v}`).join('، '),
    e.examples[0] ? `مثال: ${e.examples[0].de}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: wordHref(e.lemma) },
    openGraph: { title, description: description.slice(0, 200), type: 'article' },
  };
}

function quizFor(e: Entry): Quiz {
  const quiz: Quiz = [];
  const place = <T,>(right: T, wrong: T[], seed: number) => {
    const at = seed % (wrong.length + 1);
    const options = [...wrong];
    options.splice(at, 0, right);
    return { options, answer: at };
  };
  const seed = [...e.lemma].reduce((a, c) => a + c.charCodeAt(0), 0);
  const wrong = distractors(e, 2);
  if (wrong.length === 2)
    quiz.push({ q: `معنی «${e.lemma}» چیست؟`, ...place(e.fa.split('، ')[0], wrong, seed) });
  if (e.article) {
    const arts = ['der', 'die', 'das'];
    quiz.push({ q: `آرتیکل «${e.lemma}»؟`, options: arts, answer: arts.indexOf(e.article) });
  }
  if (e.table && 'singular' in e.table && e.table.plural[0]) {
    const pl = e.table.plural[0][1];
    const fakes = [
      ...new Set([e.lemma + 'e', e.lemma + 'en', e.lemma + 's', e.lemma.replace(/e$/, '') + 'er']),
    ]
      .filter((x) => x !== pl)
      .slice(0, 2);
    quiz.push({
      q: `جمع «${e.lemma}»؟`,
      ...place(
        `die ${pl}`,
        fakes.map((f) => `die ${f}`),
        seed + 1,
      ),
    });
  } else if (e.gram[0]) {
    quiz.push({
      q: `${e.gram[0][0]} «${e.lemma}»؟`,
      ...place(e.gram[0][1], distractorsForm(e), seed + 2),
    });
  }
  return quiz.slice(0, 3);
}

function distractorsForm(e: Entry) {
  const s = e.lemma.replace(/e?n$/, '');
  return [`${s}te`, `ge${s}t`].filter((x) => x !== e.gram[0]?.[1]);
}

export default async function WordPage({ params }: Props) {
  const e = load((await params).word);
  const family = existing(e.family.filter((w) => w !== e.lemma)).slice(0, 8);
  const synonyms = existing(e.synonyms.filter((w) => w !== e.lemma)).slice(0, 8);
  const appHref =
    siteConfig.destinations.cafeBazaar.url ?? siteConfig.destinations.webApp.url ?? '/#download';
  const pageUrl = `${siteConfig.siteUrl}${wordHref(e.lemma)}`;
  const head = `${e.article ? e.article + ' ' : ''}${e.lemma}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTerm',
        '@id': `${pageUrl}#term`,
        name: e.lemma,
        ...(head !== e.lemma ? { alternateName: head } : {}),
        description: e.senses.map((s) => s.fa).join('؛ '),
        inLanguage: 'de',
        url: pageUrl,
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          name: 'دیکشنری آلمانی به فارسی لرن‌باکس',
          url: `${siteConfig.siteUrl}/dictionary`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'لرن‌باکس', item: `${siteConfig.siteUrl}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'دیکشنری آلمانی به فارسی',
            item: `${siteConfig.siteUrl}/dictionary`,
          },
          { '@type': 'ListItem', position: 3, name: e.lemma, item: pageUrl },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <WordView entry={e} quiz={quizFor(e)} family={family} synonyms={synonyms} appHref={appHref} />
    </>
  );
}
