'use client';

import React from 'react';

import { AdminSidebar } from './AdminSidebar';
import { SplashReplacementPanel } from './SplashReplacementPanel';

/**
 * Phase 4 / Milestone 4.1 — the Admin presentation workspace («نمایش اپ»).
 *
 * This screen owns the learner-facing presentation surfaces. It adds no capability of its own: the
 * splash panel below is the existing, reviewed `SplashReplacementPanel` with its existing guarded
 * routes and store. Until this milestone that panel was mounted on the home workspace, where it sat
 * beneath the content review queue, while the sidebar entry that names it pointed nowhere — so the
 * panel moves here rather than being duplicated, keeping exactly one place where presentation is
 * managed.
 *
 * The slider is deliberately absent. Milestone 4.2 owns it, and an empty placeholder would
 * advertise a screen that cannot do anything.
 */
export function PresentationWorkspace() {
  return (
    <main className="admin-shell cp-workspace" id="presentation">
      <AdminSidebar current="presentation" />
      <section className="admin-workspace">
        <div className="page-head">
          <h2 id="presentation-title">نمایش اپ</h2>
          <p className="muted">
            کنترل تجربهٔ نمایش برنامه برای زبان‌آموز. تغییرات این بخش بدون انتشار نسخهٔ جدید اعمال
            می‌شود.
          </p>
        </div>

        <SplashReplacementPanel />
      </section>
    </main>
  );
}
