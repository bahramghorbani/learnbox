'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

import type { AdminAuthMode } from '../admin-auth-mode';
import { ErrorState, LoadingState } from './AdminStates';
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
  const [state, setState] = useState<'checking' | 'signed-out' | 'signed-in' | 'unavailable'>(
    mode === 'local-prototype' ? 'signed-in' : 'checking',
  );
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (mode === 'local-prototype') return;
    let active = true;
    void fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          setState('signed-out');
          return;
        }
        if (!response.ok) {
          setState('unavailable');
          return;
        }
        const session = (await response.json()) as { authenticated?: unknown };
        setState(session.authenticated === true ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (active) setState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [mode, retry]);

  if (mode === 'local-prototype') {
    return <WorkspaceAccess access="local-prototype">{children}</WorkspaceAccess>;
  }
  if (state === 'checking') {
    return (
      <main className="admin-auth-loading">
        <LoadingState label="در حال بررسی ورود امن…" />
      </main>
    );
  }
  if (state === 'unavailable') {
    return (
      <main className="admin-auth-loading">
        <ErrorState
          title="بررسی ورود امن انجام نشد"
          description="وضعیت نشست نمایش داده نشد. بدون ارسال اطلاعات، دوباره تلاش کنید."
          action={
            <button className="btn" onClick={() => setRetry((value) => value + 1)} type="button">
              تلاش دوباره
            </button>
          }
        />
      </main>
    );
  }
  if (state === 'signed-out')
    return <PasskeySignIn onAuthenticated={() => setState('signed-in')} />;
  return <WorkspaceAccess access="server-authenticated">{children}</WorkspaceAccess>;
}
