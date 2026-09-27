import Link from 'next/link';

const instructions = [
  {
    title: 'آیفون و آیپد',
    steps: [
      'صفحه را در Safari باز کن.',
      'دکمهٔ اشتراک‌گذاری را بزن.',
      '«Add to Home Screen» را انتخاب کن و Add را بزن.',
    ],
  },
  {
    title: 'گوشی اندروید',
    steps: [
      'صفحه را در Chrome باز کن.',
      'منوی سه‌نقطه را باز کن.',
      '«Install app» یا «Add to Home screen» را انتخاب کن.',
    ],
  },
];

export default function InstallPage() {
  return (
    <main className="install-shell">
      <section className="install-content" aria-labelledby="install-title">
        <p className="install-brand">LearnBox</p>
        <h1 id="install-title">LearnBox را روی گوشی‌ات نگه دار</h1>
        <p className="install-intro">
          با افزودن برنامه به صفحهٔ اصلی، دفعهٔ بعد سریع‌تر به تمرین روزانه‌ات می‌رسی.
        </p>
        <div className="install-steps">
          {instructions.map((instruction, index) => (
            <section
              key={instruction.title}
              className="install-device"
              aria-labelledby={`install-device-${index}`}
            >
              <h2 id={`install-device-${index}`}>{instruction.title}</h2>
              <ol>
                {instruction.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <p className="install-note">
          اگر این گزینه را نمی‌بینی، مرورگر را به‌روز کن یا صفحه را در Safari یا Chrome باز کن.
        </p>
        <Link className="install-return" href="/">
          بازگشت به LearnBox
        </Link>
      </section>
    </main>
  );
}
