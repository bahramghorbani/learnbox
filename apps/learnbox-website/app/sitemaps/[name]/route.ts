import { siteConfig } from '../../../src/config/site.mjs';
import { wordHref } from '../../../src/dictionary/href';
import { dictionaryPublic, lemmas, releaseDate } from '../../../src/dictionary/store';
import { LANDING_PAGES, urlset, WORDS_PER_SITEMAP, xmlResponse } from '../../../src/seo/sitemap';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  const at = (path: string) => new URL(path, siteConfig.siteUrl).toString();
  if (name === 'pages.xml') {
    const pages = LANDING_PAGES.map((p) => ({ loc: at(p.path), lastmod: new Date(p.updated) }));
    if (dictionaryPublic()) pages.push({ loc: at('/dictionary'), lastmod: releaseDate() as Date });
    return xmlResponse(urlset(pages));
  }
  const part = /^dictionary-([1-9][0-9]{0,3})\.xml$/.exec(name);
  if (part && dictionaryPublic()) {
    const start = (Number(part[1]) - 1) * WORDS_PER_SITEMAP;
    // One URL per page: a decomposed headword with a composed twin shares the twin's URL.
    const hrefs = [...new Set(lemmas().map(wordHref))];
    const words = hrefs.slice(start, start + WORDS_PER_SITEMAP);
    if (words.length) return xmlResponse(urlset(words.map((href) => ({ loc: at(href) }))));
  }
  return new Response('Not found', { status: 404 });
}
