import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminSidebar } from '../app/components/AdminSidebar';

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

function rule(selector: string) {
  const match = css.match(
    new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`),
  );
  return match?.[2] ?? '';
}

/**
 * Stage 1 of docs/planning/ADMIN_UI_IMPLEMENTATION_PLAN.md — the shell, header and navigation
 * aligned to the APPROVED, DESIGN FROZEN prototype (PDR-009), `proto/admin-ui-concept` @ 8b3e050d.
 */
describe('Admin shell alignment with the approved reference', () => {
  it('resolves the shared design tokens everywhere, not only inside a workspace wrapper', () => {
    // Scoped to `.cp-workspace` these silently resolved to nothing on surfaces outside the shell,
    // which is how the shared spinner lost its border on the sign-in check screen.
    const root = rule(':root');
    for (const token of [
      '--sidebar-w',
      '--line-soft',
      '--surface',
      '--surface-2',
      '--lavender-soft',
      '--purple-ink',
      '--radius',
      '--radius-sm',
      '--shadow-sm',
      '--rose-ink',
      '--amber-ink',
    ]) {
      expect(root, `${token} must be defined at :root`).toContain(`${token}:`);
    }
    expect(root).toContain('--sidebar-w: 186px;');
  });

  it('keeps the two deliberate canvas overrides intact', () => {
    // The review screen stays true-white (pinned by the contrast guard); prototype-styled screens
    // keep the reference canvas, which only works while `.cp-workspace` is declared after it.
    expect(rule('.admin-shell')).toContain('--canvas: #fff;');
    expect(rule('.cp-workspace')).toContain('--canvas: #f5f4fa;');
    expect(css.indexOf('.cp-workspace {')).toBeGreaterThan(css.indexOf('.admin-shell {'));
  });

  it('takes the sidebar width from the token instead of hard-coding it', () => {
    expect(rule('.admin-sidebar')).toContain('width: var(--sidebar-w);');
    expect(rule('.admin-sidebar')).toContain('position: sticky;');
  });

  it('never hides a navigation label, at any width', () => {
    // The previous narrow-screen shell collapsed the sidebar with `font-size: 0`, which removed
    // every Persian label. The reference keeps labels and scrolls the bar horizontally instead.
    const navBlocks = css.match(/\.admin-nav-item[^{]*\{[^}]*\}/g) ?? [];
    for (const block of navBlocks) {
      expect(block, 'a nav rule must not zero out its label').not.toMatch(/font-size:\s*0\b/);
    }
    expect(rule('.admin-logo')).not.toMatch(/font-size:\s*0\b/);
  });

  it('gives keyboard users a visible focus ring the reference does not have', () => {
    expect(css).toContain('.admin-nav-item:focus-visible');
    expect(css).toMatch(/\.admin-nav-item:focus-visible[^}]*outline:/s);
  });

  it('uses the reference active state', () => {
    const active = rule('.admin-nav-item.is-current');
    expect(active).toContain('background: var(--lavender-soft);');
    expect(active).toContain('color: var(--purple-ink);');
  });

  it('does not advertise the collapse control as working', () => {
    // It has never had a handler. The reference has no such control at all, but removing an
    // existing control is out of scope, so it is rendered disabled rather than left clickable.
    const html = renderToStaticMarkup(<AdminSidebar current="users" />);
    expect(html).toMatch(/<button[^>]*class="collapse-control"[^>]*disabled/);
    expect(html).toContain('aria-disabled="true"');
  });

  it('still marks unimplemented destinations as pending rather than linking nowhere', () => {
    const html = renderToStaticMarkup(<AdminSidebar current="users" />);
    // یادگیری / نشست‌ها و دسترسی / تنظیمات have no route yet.
    expect((html.match(/data-admin-nav-pending="true"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('href="#undefined"');
  });
});
