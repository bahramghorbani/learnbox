import type { MetadataRoute } from 'next';
import { siteConfig } from '../src/config/site.mjs';
import { AI_AND_SEARCH_AGENTS, DISALLOW } from '../src/seo/sitemap';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      // Search engines and AI assistants are welcome to read and cite the landing and dictionary.
      { userAgent: AI_AND_SEARCH_AGENTS, allow: '/', disallow: DISALLOW },
    ],
    sitemap: `${siteConfig.siteUrl}/sitemap.xml`,
    host: siteConfig.siteUrl,
  };
}
