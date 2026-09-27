import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OwnerOtpTest } from './OwnerOtpTest';
import { isOwnerOtpTestEnabled } from './owner-otp-test';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'آزمون پیامک | LearnBox',
  robots: { index: false, follow: false },
};

export default function OwnerOtpTestPage() {
  if (!isOwnerOtpTestEnabled(process.env)) notFound();
  return <OwnerOtpTest />;
}
