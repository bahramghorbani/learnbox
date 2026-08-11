import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isOwnerInviteIssuerEnabled } from '../../../../api/dist/alpha/owner-invite-issuer.js';
import { OwnerAlphaInviteTest } from './OwnerAlphaInviteTest';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'کد دعوت آزمایشی | LearnBox',
  robots: { index: false, follow: false },
};

export default function OwnerAlphaInviteTestPage() {
  if (!isOwnerInviteIssuerEnabled(process.env)) notFound();
  return <OwnerAlphaInviteTest />;
}
