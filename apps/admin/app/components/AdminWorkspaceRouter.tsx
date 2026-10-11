'use client';

import React, { useEffect, useState } from 'react';

import { AccessWorkspace } from './AccessWorkspace';
import { AdminSidebar } from './AdminSidebar';
import { AuditLogWorkspace } from './AuditLogWorkspace';
import { ContentPacksWorkspace } from './ContentPacksWorkspace';
import { ContentReviewWorkspace } from './ContentReviewWorkspace';
import { DashboardWorkspace } from './DashboardWorkspace';
import { LearningWorkspace } from './LearningWorkspace';
import { OperationsWorkspace } from './OperationsWorkspace';
import { PresentationWorkspace } from './PresentationWorkspace';
import { SettingsWorkspace } from './SettingsWorkspace';
import { StoreListingsWorkspace } from './StoreListingsWorkspace';
import { UsersManagement } from './UsersManagement';

/**
 * Minimal hash router for the approved Admin navigation model. Milestone 1.1 made two destinations
 * real — «خانه / نمای کلی» (the existing, real Content Review workspace) and «محتوا و بسته‌ها».
 * Milestone 2.1 adds «فروشگاه», the commercial listing surface, so navigation works in every
 * direction without forking any screen.
 *
 * Milestone 3.3 adds «عملیات» (the audit log) and, in the same change, «کاربران»: the M3.1/M3.2
 * support screen was reachable only from the superseded `AdminWorkspace` shell, so account
 * suspension and manual pack entitlements existed as working APIs behind a screen this router
 * could not open. Phase 3 cannot be complete while that is true, so the route is wired here rather
 * than deferred.
 *
 * Milestone 4.1 adds «نمایش اپ»: the splash management panel was real and guarded but mounted on
 * the home workspace, while the sidebar entry that names it pointed nowhere. The destination now
 * opens the presentation workspace, which is where splash — and later the slider — belongs.
 *
 * Stage 2 gives «خانه» its real screen: the Dashboard. Content review used to occupy home purely
 * because nothing else did, and the frozen nine-item nav has no review entry, so review moves to
 * its own `#review` destination — reachable from the dashboard panel that previews its queue.
 * Replacing home without that link would have left a working, audited workspace unreachable.
 * Stage 8 makes «نشست‌ها و دسترسی» a real route. It deliberately renders only the current-session
 * and Passkey facts the existing security contracts provide; invented device, role or audit rows
 * are forbidden here.
 * Stage 9 makes «یادگیری» read-only and only consumes the existing Dashboard aggregate; scheduler,
 * progress, retention and quality figures remain unavailable until a permitted read model exists.
 * Stage 10 completes «عملیات» and «تنظیمات» with only existing read-only operational contracts;
 * health, queue, deployment and environment details remain unavailable without a source.
 */
type AdminRoute =
  | 'content'
  | 'store'
  | 'users'
  | 'learning'
  | 'ops'
  | 'settings'
  | 'audit'
  | 'presentation'
  | 'access'
  | 'review'
  | 'home';

function readRoute(hash: string): AdminRoute {
  const value = hash.replace(/^#/, '');
  if (value === 'content') return 'content';
  if (value === 'store') return 'store';
  if (value === 'users') return 'users';
  if (value === 'learning') return 'learning';
  if (value === 'ops') return 'ops';
  if (value === 'settings') return 'settings';
  if (value === 'audit') return 'audit';
  if (value === 'presentation') return 'presentation';
  if (value === 'access') return 'access';
  if (value === 'review') return 'review';
  return 'home';
}

export function AdminWorkspaceRouter() {
  const [route, setRoute] = useState<AdminRoute>('home');

  useEffect(() => {
    const sync = () => setRoute(readRoute(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  if (route === 'content') return <ContentPacksWorkspace />;
  if (route === 'store') return <StoreListingsWorkspace />;
  if (route === 'audit') return <AuditLogWorkspace />;
  if (route === 'ops') return <OperationsWorkspace />;
  if (route === 'settings') return <SettingsWorkspace />;
  if (route === 'presentation') return <PresentationWorkspace />;
  if (route === 'access') return <AccessWorkspace />;
  if (route === 'review') return <ContentReviewWorkspace />;
  // The support screen renders its own section inside the shell frame. Stage 5 moved its markup
  // onto the approved vocabulary; the framing here is unchanged.
  if (route === 'users') {
    return (
      <main className="admin-shell cp-workspace" id="users">
        <AdminSidebar current="users" />
        <section className="admin-workspace">
          <UsersManagement />
        </section>
      </main>
    );
  }
  if (route === 'learning') return <LearningWorkspace />;
  return <DashboardWorkspace />;
}
