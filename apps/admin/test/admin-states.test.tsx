import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyState, ErrorState, LoadingState } from '../app/components/AdminStates';

/**
 * Stage 0 of docs/planning/ADMIN_UI_IMPLEMENTATION_PLAN.md.
 *
 * These assertions pin the two things a shared state pattern can silently lose: the accessibility
 * contract (a failure must interrupt, a wait must not) and the rule that nothing is rendered
 * except what the caller supplied — no prototype demo data, no placeholder number.
 */
describe('shared Admin state patterns', () => {
  it('announces a wait politely and keeps the spinner decorative', () => {
    const html = renderToStaticMarkup(<LoadingState label="در حال بررسی ورود امن…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('در حال بررسی ورود امن…');
    // The spinner carries no meaning, so it must be hidden from assistive technology.
    expect(html).toMatch(/class="spinner" aria-hidden="true"/);
    // A wait is not a failure.
    expect(html).not.toContain('role="alert"');
  });

  it('renders an empty state as a status, not an alert, in both variants', () => {
    const compact = renderToStaticMarkup(<EmptyState title="کاربری یافت نشد." icon="search" />);
    expect(compact).toContain('class="empty"');
    expect(compact).toContain('role="status"');
    expect(compact).not.toContain('role="alert"');

    const page = renderToStaticMarkup(
      <EmptyState title="هنوز بسته‌ای ساخته نشده است" description="توضیح" variant="page" />,
    );
    expect(page).toContain('class="empty-xl"');
    expect(page).toContain('class="e-ic-xl"');
  });

  it('omits description and action when the caller supplies none', () => {
    const html = renderToStaticMarkup(<EmptyState title="خالی" />);
    expect(html).not.toContain('e-text');
    expect(html).not.toContain('e-cta');
    // Only the caller's own words reach the DOM.
    expect(html.replace(/<[^>]*>/g, '').trim()).toBe('خالی');
  });

  it('interrupts for an error, and keeps the tone-to-icon mapping', () => {
    const rose = renderToStaticMarkup(
      <ErrorState title="ارتباط برقرار نشد" description="دوباره" />,
    );
    expect(rose).toContain('role="alert"');
    expect(rose).toContain('class="err-block rose"');

    const amber = renderToStaticMarkup(
      <ErrorState title="دسترسی کافی نیست" description="از مدیر ارشد بخواهید" tone="amber" />,
    );
    expect(amber).toContain('class="err-block amber"');
    // amber is the authorization tone: shield, not the rose alert triangle
    expect(amber).toContain('M12 21s7-3.3 7-9V6l-7-3-7 3v6c0 5.7 7 9 7 9Z');

    const grey = renderToStaticMarkup(
      <ErrorState title="یافت نشد" description="نشانی تغییر کرده" tone="grey" />,
    );
    expect(grey).toContain('class="err-block grey"');
    expect(grey).toContain('<circle cx="11" cy="11" r="7"');
  });

  it('renders a caller-supplied action inside the call-to-action slot', () => {
    const html = renderToStaticMarkup(
      <ErrorState
        title="خطا"
        description="توضیح"
        action={<button type="button">تلاش مجدد</button>}
      />,
    );
    expect(html).toContain('class="e-cta"');
    expect(html).toContain('تلاش مجدد');
  });
});
