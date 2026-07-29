import type { MetadataRoute } from 'next';
import { siteConfig } from '../src/config/site.mjs';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteConfig.siteUrl,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: new URL('/privacy', siteConfig.siteUrl).toString(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: new URL('/terms', siteConfig.siteUrl).toString(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
