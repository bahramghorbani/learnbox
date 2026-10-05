import React from 'react';

type AdminIconName =
  | 'home'
  | 'book'
  | 'store'
  | 'users'
  | 'chart'
  | 'image'
  | 'shield'
  | 'ops'
  | 'settings'
  | 'collapse';

/**
 * Navigation is the APPROVED, DESIGN FROZEN Admin prototype's nav, verbatim:
 * `prototypes/admin-ui-v1/assets/js/shell.js` (PDR-009), same labels, same order, same icons.
 *
 * `route` is set only for destinations that are really implemented. Every other entry renders as
 * a visibly disabled item rather than a link to nowhere, so the frozen design is preserved without
 * advertising screens that do not exist yet.
 */
const navItems = [
  { label: 'خانه / نمای کلی', icon: 'home', route: 'home' },
  { label: 'محتوا و بسته‌ها', icon: 'book', route: 'content' },
  { label: 'فروشگاه', icon: 'store' },
  { label: 'کاربران', icon: 'users' },
  { label: 'یادگیری', icon: 'chart' },
  { label: 'نمایش اپ', icon: 'image' },
  { label: 'نشست‌ها و دسترسی', icon: 'shield' },
  { label: 'عملیات', icon: 'ops' },
  { label: 'تنظیمات', icon: 'settings' },
] as const satisfies readonly {
  label: string;
  icon: AdminIconName;
  route?: string;
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
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.2 12 3l9 7.2" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
          <path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H13v18h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
        </svg>
      );
    case 'store':
      return (
        <svg {...common}>
          <path d="M3 7h18l-1 4.2a3 3 0 0 1-2.9 2.3H6.9A3 3 0 0 1 4 11.2z" />
          <path d="M5 13.5V21h14v-7.5" />
          <path d="M8 7V5a4 4 0 0 1 8 0v2" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20c0-3.1 2.5-5.2 5.5-5.2s5.5 2.1 5.5 5.2" />
          <path d="M16.5 6.4a3 3 0 0 1 0 5.9" />
          <path d="M18 14.9c2 .6 3.4 2.3 3.4 4.6" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20H2" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect height="16" rx="2.6" width="18" x="3" y="4" />
          <circle cx="8.6" cy="9.6" r="1.6" />
          <path d="m4 17 4.6-4.2L13 17" />
          <path d="m13 15 2.6-2.4L20 17" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l7.5 3v5.6c0 4.5-3 8.3-7.5 9.4-4.5-1.1-7.5-4.9-7.5-9.4V6z" />
          <path d="m9 12 2.2 2.2L15.5 10" />
        </svg>
      );
    case 'ops':
      return (
        <svg {...common}>
          <rect height="6" rx="2" width="18" x="3" y="4" />
          <rect height="6" rx="2" width="18" x="3" y="14" />
          <path d="M7 7h.01M7 17h.01" />
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

export function AdminSidebar({ current = 'home' }: { current?: string } = {}) {
  return (
    <aside className="admin-sidebar" aria-label="ناوبری مدیریت">
      <a className="admin-logo" href="#home">
        <span aria-hidden="true">◇</span>
        LearnBox
      </a>
      <nav>
        {navItems.map((item) => {
          const icon = (
            <span aria-hidden="true" className="admin-nav-icon" data-admin-nav-icon={item.icon}>
              <AdminIcon name={item.icon} />
            </span>
          );

          if (!('route' in item) || !item.route) {
            return (
              <span
                aria-disabled="true"
                className="admin-nav-item is-pending"
                data-admin-nav-pending="true"
                key={item.label}
                title="این بخش هنوز پیاده‌سازی نشده است"
              >
                {icon}
                {item.label}
              </span>
            );
          }

          const isCurrent = item.route === current;
          return (
            <a
              aria-current={isCurrent ? 'page' : undefined}
              className={isCurrent ? 'admin-nav-item is-current' : 'admin-nav-item'}
              href={`#${item.route}`}
              key={item.label}
            >
              {icon}
              {item.label}
            </a>
          );
        })}
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
