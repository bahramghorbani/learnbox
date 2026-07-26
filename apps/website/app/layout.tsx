import type { Metadata, Viewport } from 'next';
import './globals.css';

import { ServiceWorkerRegistration } from './components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'LearnBox',
  description: 'یادگیری واژگان آلمانی',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'LearnBox', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#6b4bd8' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
