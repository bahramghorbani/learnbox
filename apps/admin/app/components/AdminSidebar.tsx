import React from 'react';

type AdminIconName = 'review' | 'splash' | 'content' | 'reports' | 'settings' | 'collapse';

const navItems = [
  { label: 'صف بررسی', icon: 'review', href: '#review' },
  { label: 'اسپلش', icon: 'splash', href: '#splash-management' },
  { label: 'محتوا', icon: 'content', href: '#review' },
  { label: 'گزارش‌ها', icon: 'reports', href: '#review' },
  { label: 'تنظیمات', icon: 'settings', href: '#review' },
] as const satisfies readonly {
  label: string;
  icon: AdminIconName;
  href: string;
}[];

function AdminIcon({ name }: { name: AdminIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
  };

  switch (name) {
    case 'review':
      return (
        <svg {...common}>
          <path d="M13.5 6.5 17.5 10.5" />
          <path d="m5 19 3.25-.65 9.6-9.6a2.1 2.1 0 0 0-3-3l-9.6 9.6L5 19Z" />
          <path d="M13 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-6" />
        </svg>
      );
    case 'splash':
      return (
        <svg {...common}>
          <rect height="16" rx="2.5" width="18" x="3" y="4" />
          <circle cx="8.5" cy="9" r="1.25" />
          <path d="m5.5 17 4.25-4.25 3 3 2.25-2.25L18.5 17" />
        </svg>
      );
    case 'content':
      return (
        <svg {...common}>
          <path d="M5 8h14l-1 11H6L5 8Z" />
          <path d="m7 8 1.5-4h7L17 8" />
          <path d="M9.5 12h5" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...common}>
          <path d="M4 20V10h4v10" />
          <path d="M10 20V4h4v16" />
          <path d="M16 20v-7h4v7" />
          <path d="M3 20h18" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H10.4v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-3.2h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.06 4.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h3.2v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.09v3.2h-.09A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
      );
    case 'collapse':
      return (
        <svg {...common}>
          <path d="m13 7-5 5 5 5" />
          <path d="m18 7-5 5 5 5" />
        </svg>
      );
  }
}

export function AdminSidebar() {
  return (
    <aside className="admin-sidebar" aria-label="ناوبری مدیریت">
      <a className="admin-logo" href="#review">
        <span aria-hidden="true">◇</span>
        LearnBox
      </a>
      <nav>
        {navItems.map(({ label, icon, href }, index) => (
          <a
            aria-current={index === 0 ? 'page' : undefined}
            className={index === 0 ? 'admin-nav-item is-current' : 'admin-nav-item'}
            href={href}
            key={label}
          >
            <span aria-hidden="true" className="admin-nav-icon" data-admin-nav-icon={icon}>
              <AdminIcon name={icon} />
            </span>
            {label}
          </a>
        ))}
      </nav>
      <button className="collapse-control" type="button">
        <span aria-hidden="true" data-admin-collapse-icon>
          <AdminIcon name="collapse" />
        </span>
        جمع کردن
      </button>
    </aside>
  );
}
