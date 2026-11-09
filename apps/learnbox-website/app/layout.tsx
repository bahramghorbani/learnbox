import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { siteConfig } from '../src/config/site.mjs';
import Script from 'next/script';
import './globals.css';
import '../src/themes/summer/germany-chapters.css';
import '../src/themes/summer/summer-theme.css';

const learnBoxFont = localFont({
  src: [
    {
      path: '../public/fonts/IRANSansX-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/IRANSansX-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-learnbox',
  display: 'swap',
  fallback: ['Tahoma', 'Arial', 'sans-serif'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: 'آموزش زبان آلمانی | لرن باکس',
    template: '%s | لرن باکس',
  },
  description:
    'واژگان آلمانی را با مرور فاصله‌دار، جعبه لایتنر و تمرین‌های کوتاه روزانه بهتر به خاطر بسپار.',
  keywords: [
    'یادگیری زبان آلمانی',
    'واژگان آلمانی',
    'جعبه لایتنر',
    'مرور فاصله‌دار',
    'آموزش آلمانی برای فارسی‌زبانان',
  ],
  applicationName: 'LearnBox',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    url: '/',
    siteName: 'LearnBox',
    title: 'آموزش زبان آلمانی | لرن باکس',
    description: 'واژگان آلمانی را با مرور هوشمند، جعبه لایتنر و تمرین‌های کوتاه روزانه یاد بگیر.',
    images: [
      {
        url: '/themes/summer/backgrounds/berlin-summer-v3.jpg',
        width: 1672,
        height: 941,
        alt: 'فضای تابستانی LearnBox در برلین',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'آموزش زبان آلمانی | لرن باکس',
    description: 'مرور هوشمند واژگان آلمانی برای فارسی‌زبانان.',
    images: ['/themes/summer/backgrounds/berlin-summer-v3.jpg'],
  },
  // Google Search Console ownership (URL-prefix property https://learnboxapp.com/). Public token.
  verification: { google: 'E8cjvDTwlHqZWkoctqJQZ3EzrCekIjpDwariOwkgV0k' },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body className={learnBoxFont.variable}>
        {children}
        <Script
          id="ZwSg9rf6GA"
          src="https://statsfa.com/js/script.js"
          data-host="https://statsfa.com"
          data-dnt="false"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
