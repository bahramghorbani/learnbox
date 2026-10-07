'use client';

import React, { useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';
import { AuditLogWorkspace } from './AuditLogWorkspace';
import { ContentPacksWorkspace } from './ContentPacksWorkspace';
import { ContentReviewWorkspace } from './ContentReviewWorkspace';
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
 */
type AdminRoute = 'content' | 'store' | 'users' | 'audit' | 'home';

function readRoute(hash: string): AdminRoute {
  const value = hash.replace(/^#/, '');
  if (value === 'content') return 'content';
  if (value === 'store') return 'store';
  if (value === 'users') return 'users';
  if (value === 'audit') return 'audit';
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
  // The support screen predates the approved shell and renders its own section, so it is framed
  // here instead of being rewritten — the M3.1/M3.2 screen stays byte-for-byte the reviewed one.
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
  return <ContentReviewWorkspace />;
}
