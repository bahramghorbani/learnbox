import type { Metadata } from 'next';
import { VariantPreview } from '../../components/landing/VariantPreview';

export const metadata: Metadata = {
  title: 'LearnBox Landing Variant A',
  robots: { index: false, follow: false },
};

export default function VariantA() {
  return <VariantPreview variant="a" />;
}
