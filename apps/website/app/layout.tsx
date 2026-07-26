import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'LearnBox', description: 'یادگیری واژگان آلمانی' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
