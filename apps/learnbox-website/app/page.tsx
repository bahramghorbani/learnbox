import { LandingExperience } from './components/landing/LandingExperience';
import { siteConfig } from '../src/config/site.mjs';
import { ldJson } from '../src/seo/sitemap';

const site = siteConfig.siteUrl;
// Who publishes the site, for search engines and AI assistants (schema.org).
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${site}/#org`,
      name: 'لرن‌باکس',
      alternateName: 'LearnBox',
      url: `${site}/`,
      logo: `${site}/icon.svg`,
      email: 'hi@learnboxapp.com',
    },
    {
      '@type': 'WebSite',
      '@id': `${site}/#website`,
      name: 'لرن‌باکس',
      alternateName: 'LearnBox',
      url: `${site}/`,
      inLanguage: 'fa',
      publisher: { '@id': `${site}/#org` },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <LandingExperience />
    </>
  );
}
