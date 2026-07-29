import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LearnBox | یادگیری واژگان آلمانی',
    short_name: 'LearnBox',
    description: 'یادگیری واژگان آلمانی با مرور هوشمند و تمرین‌های کوتاه روزانه.',
    start_url: '/',
    display: 'browser',
    background_color: '#f7f3ff',
    theme_color: '#6840d4',
    lang: 'fa',
    dir: 'rtl',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
