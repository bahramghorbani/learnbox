import React from 'react';

const navItems = [
  ['صف بررسی', '▣', '#review'],
  ['اسپلش', '◉', '#splash-management'],
  ['محتوا', '▤', '#review'],
  ['گزارش‌ها', '▥', '#review'],
  ['تنظیمات', '⚙', '#review'],
] as const;

export function AdminSidebar() {
  return (
    <aside className="admin-sidebar" aria-label="ناوبری مدیریت">
      <a className="admin-logo" href="#review">
        <span aria-hidden="true">◇</span>
        LearnBox
      </a>
      <nav>
        {navItems.map(([label, icon, href], index) => (
          <a
            className={index === 0 ? 'admin-nav-item is-current' : 'admin-nav-item'}
            href={href}
            key={label}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </a>
        ))}
      </nav>
      <button className="collapse-control" type="button">
        <span aria-hidden="true">»</span>
        جمع کردن
      </button>
    </aside>
  );
}
