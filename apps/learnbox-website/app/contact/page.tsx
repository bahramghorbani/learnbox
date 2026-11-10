import type { Metadata } from 'next';
import { LegalPageLayout } from '../components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'راه‌های تماس با تیم LearnBox: ایمیل، تلفن و نشانی دفتر.',
  alternates: {
    canonical: 'https://learnboxapp.com/contact',
  },
};

export default function ContactPage() {
  return (
    <LegalPageLayout
      eyebrow="تماس با ما"
      title="با تیم LearnBox در ارتباط باشید"
      description="برای پرسش، پیشنهاد یا گزارش مشکل می‌توانید از راه‌های زیر با ما تماس بگیرید. تلاش می‌کنیم در سریع‌ترین زمان ممکن پاسخ‌گو باشیم."
    >
      <section>
        <h2>۱. راه‌های تماس</h2>
        <ul>
          <li>
            ایمیل:{' '}
            <a dir="ltr" href="mailto:bahrameghorbani@gmail.com">
              bahrameghorbani@gmail.com
            </a>
          </li>
          <li>
            تلفن ثابت:{' '}
            <a dir="ltr" href="tel:02145628610">
              ۰۲۱۴۵۶۲۸۶۱۰
            </a>
          </li>
          <li>
            پیام‌رسان تلگرام:{' '}
            <a dir="ltr" href="https://t.me/learnboxsupportbot" target="_blank" rel="noreferrer">
              @learnboxsupportbot
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2>۲. نشانی دفتر</h2>
        <p>
          استان تهران، شهرستان شمیرانات، بخش مرکزی، شهر تجریش، محلهٔ ازگل، خیابان شهید سیدامین
          صدرنژاد، کوچهٔ ساحل، بوستان، بلوک ۱، پلاک ۱، طبقهٔ ۴، واحد ۱۵.
        </p>
        <p dir="ltr">کد پستی: ۱۶۹۴۹۱۶۹۳۸</p>
      </section>

      <section>
        <h2>۳. زمان پاسخ‌گویی</h2>
        <p>
          پیام‌های ایمیل و تلگرام معمولاً در طول روزهای کاری بررسی و پاسخ داده می‌شوند. برای
          پرسش‌های فوری مرتبط با حساب کاربری یا پرداخت، استفاده از تلگرام پشتیبانی سریع‌تر است.
        </p>
      </section>
    </LegalPageLayout>
  );
}
