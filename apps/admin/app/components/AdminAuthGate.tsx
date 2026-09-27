'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

import type { AdminAuthMode } from '../admin-auth-mode';
import { PasskeySignIn } from './PasskeySignIn';

export type AdminWorkspaceAccess = 'local-prototype' | 'server-authenticated';

const AdminWorkspaceAccessContext = createContext<AdminWorkspaceAccess>('local-prototype');

export function useAdminWorkspaceAccess() {
  return useContext(AdminWorkspaceAccessContext);
}

function WorkspaceAccess({
  access,
  children,
}: {
  access: AdminWorkspaceAccess;
  children?: React.ReactNode;
}) {
  return (
    <AdminWorkspaceAccessContext.Provider value={access}>
      {children}
    </AdminWorkspaceAccessContext.Provider>
  );
}

type AdminAuthGateProps = {
  mode: AdminAuthMode;
  children?: React.ReactNode;
};

export function AdminAuthGate({ mode, children }: AdminAuthGateProps) {
  const [state, setState] = useState<'checking' | 'signed-out' | 'signed-in'>(
    mode === 'local-prototype' ? 'signed-in' : 'checking',
  );

  useEffect(() => {
    if (mode === 'local-prototype') return;
    let active = true;
    void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((session) => {
        if (!active) return;
        setState(session?.authenticated ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (active) setState('signed-out');
      });
    return () => {
      active = false;
    };
  }, [mode]);

  if (mode === 'local-prototype') {
    return <WorkspaceAccess access="local-prototype">{children}</WorkspaceAccess>;
  }
  if (state === 'checking') {
    return (
      <main className="admin-auth-loading" aria-live="polite">
        در حال بررسی ورود امن…
      </main>
    );
  }
  if (state === 'signed-out')
    return <PasskeySignIn onAuthenticated={() => setState('signed-in')} />;
  return <WorkspaceAccess access="server-authenticated">{children}</WorkspaceAccess>;
}
