import type { Metadata } from 'next';
import { VariantPreview } from '../../components/landing/VariantPreview';

export const metadata: Metadata = {
  title: 'LearnBox Landing Variant C',
  robots: { index: false, follow: false },
};

export default function VariantC() {
  return <VariantPreview variant="c" />;
}
