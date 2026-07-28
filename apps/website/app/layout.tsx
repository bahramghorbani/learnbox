import type { Metadata, Viewport } from 'next';
import './globals.css';

import { ServiceWorkerRegistration } from './components/ServiceWorkerRegistration';
import { LaunchScreen } from './components/LaunchScreen';

export const metadata: Metadata = {
  title: 'LearnBox',
  description: 'یادگیری واژگان آلمانی',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'LearnBox', statusBarStyle: 'default' },
  icons: {
    apple: '/icons/learnbox-v1-192.png',
    icon: [
      { url: '/icons/learnbox-v1-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/learnbox-v1-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#6b4bd8' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <LaunchScreen />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
