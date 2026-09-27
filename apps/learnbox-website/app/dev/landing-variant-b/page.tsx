import type { Metadata } from 'next';
import { VariantPreview } from '../../components/landing/VariantPreview';

export const metadata: Metadata = {
  title: 'LearnBox Landing Variant B',
  robots: { index: false, follow: false },
};

export default function VariantB() {
  return <VariantPreview variant="b" />;
}
