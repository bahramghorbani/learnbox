'use client';

import React from 'react';

import { AdminSidebar } from './AdminSidebar';
import { SliderManagerPanel } from './SliderManagerPanel';
import { SplashReplacementPanel } from './SplashReplacementPanel';

/**
 * Phase 4 / Milestones 4.1 and 4.2 — the Admin presentation workspace («نمایش اپ»).
 *
 * This screen owns the learner-facing presentation surfaces. The splash panel is the existing,
 * reviewed `SplashReplacementPanel` with its existing guarded routes and store. Until M4.1 that
 * panel was mounted on the home workspace, where it sat beneath the content review queue, while the
 * sidebar entry that names it pointed nowhere — so the panel moved here rather than being
 * duplicated, keeping exactly one place where presentation is managed.
 *
 * M4.2 adds the slider panel beside it. Both panels manage canonical rows through guarded routes,
 * and each is behind its own default-off flag, so one being unavailable in an environment does not
 * hide the other.
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

        <SliderManagerPanel />
        <SplashReplacementPanel />
      </section>
    </main>
  );
}
