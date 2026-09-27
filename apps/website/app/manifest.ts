import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LearnBox | یادگیری واژگان آلمانی',
    short_name: 'LearnBox',
    description: 'یادگیری آرام و پیوستهٔ واژگان آلمانی',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6b4bd8',
    lang: 'fa',
    dir: 'rtl',
    icons: [
      { src: '/icons/learnbox-v1-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/learnbox-v1-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
