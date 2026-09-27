import Link from 'next/link';
import type { ReactNode } from 'react';
import './legal-page.css';

type LegalPageLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  children: ReactNode;
};

export function LegalPageLayout({
  eyebrow,
  title,
  description,
  effectiveDate,
  children,
}: LegalPageLayoutProps) {
  return (
    <main className="legal-page">
      <a className="legal-skip-link" href="#legal-content">
        پرش به متن اصلی
      </a>
      <header className="legal-header">
        <Link className="legal-home-link" href="/">
          <span aria-hidden="true">LB</span>
          <strong dir="ltr">LearnBox</strong>
        </Link>
        <p className="legal-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-description">{description}</p>
        <dl className="legal-version" aria-label="وضعیت سند">
          <div>
            <dt>نسخه</dt>
            <dd>پیش‌نویس عملیاتی ۱٫۰</dd>
          </div>
          <div>
            <dt>تاریخ اجرا</dt>
            <dd>{effectiveDate}</dd>
          </div>
        </dl>
      </header>
      <article id="legal-content" className="legal-content">
        {children}
      </article>
      <footer className="legal-footer">
        <p>
          برای پرسش دربارهٔ این سند به{' '}
          <a dir="ltr" href="mailto:hi@learnboxapp.com">
            hi@learnboxapp.com
          </a>{' '}
          ایمیل بزنید.
        </p>
        <Link href="/">بازگشت به صفحهٔ اصلی LearnBox</Link>
      </footer>
    </main>
  );
}
