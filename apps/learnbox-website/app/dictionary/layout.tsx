import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { siteConfig } from '../../src/config/site.mjs';
import { dictionaryEnabled } from '../../src/dictionary/store';
import { DictHeader, SaveSheet } from './client';
import './dictionary.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'دیکشنری آلمانی به فارسی', template: '%s | دیکشنری لرن‌باکس' },
};

export default function DictionaryLayout({ children }: { children: React.ReactNode }) {
  if (!dictionaryEnabled()) notFound();
  const webApp = siteConfig.destinations.webApp.url ?? 'https://app.learnboxapp.com/';
  return (
    <div className="lbd">
      <a className="skip" href="#main" style={{ position: 'absolute', right: -999 }}>
        پرش به محتوا
      </a>
      <div className="wrap">
        <DictHeader />
      </div>
      <main id="main">{children}</main>
      <SaveSheet href={webApp} />
    </div>
  );
}
