import type { Metadata } from 'next';
import './globals.css';
import '../src/themes/summer/summer-theme.css';

export const metadata: Metadata = {
  title: 'LearnBox | یادگیری آلمانی، ماندگار و هوشمند',
  description: 'یادگیری واژگان آلمانی با مرور هوشمند LearnBox.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
