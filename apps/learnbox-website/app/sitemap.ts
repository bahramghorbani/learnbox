import type { MetadataRoute } from 'next';
import { siteConfig } from '../src/config/site.mjs';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteConfig.siteUrl,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
