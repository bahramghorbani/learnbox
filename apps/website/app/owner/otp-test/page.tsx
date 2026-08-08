import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OwnerOtpTest } from './OwnerOtpTest';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'آزمون پیامک | LearnBox',
  robots: { index: false, follow: false },
};

export default function OwnerOtpTestPage() {
  if (process.env.LEARNBOX_OTP_TEST_UI_ENABLED !== 'true') notFound();
  return <OwnerOtpTest />;
}
