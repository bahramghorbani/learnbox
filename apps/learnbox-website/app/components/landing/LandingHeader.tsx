'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

type LandingHeaderProps = {
  onStart: () => void;
};

const links = [
  ['روش یادگیری', '#method'],
  ['مسیرها', '#paths'],
  ['نمای اپ', '#product'],
  ['دانلود', '#download'],
];

export function LandingHeader({ onStart }: LandingHeaderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  return (
    <header className="landing-header wrap" data-header>
      <div className="header-main">
        <a className="brand" href="#top" aria-label="LearnBox، صفحهٔ اصلی">
          <b aria-hidden="true">LB</b>
          <span>LearnBox</span>
        </a>
        <nav className="desktop-nav" aria-label="ناوبری اصلی">
          {links.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="header-actions">
        <button className="button button--compact" onClick={onStart}>
          یادگیری را شروع کن
        </button>
        <button
          className="menu-toggle"
          aria-label={open ? 'بستن منو' : 'باز کردن منو'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            className="mobile-nav"
            aria-label="ناوبری موبایل"
            initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
            exit={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {links.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>
                {label}
              </a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
