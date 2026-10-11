'use client';

import React, { useEffect, useState } from 'react';
import { ContentReviewWorkspace } from './ContentReviewWorkspace';
import { UsersManagement } from './UsersManagement';
import { PackBuilder } from './PackBuilder';
import { AddPasskeyButton } from './AddPasskeyButton';

type AdminView = 'review' | 'users' | 'packs' | 'settings';

/**
 * Superseded shell, kept only because nothing imports it and deleting it is a separate change.
 * Stage 6 removed its `#finance` branch with `FinancePanel`: that panel rendered fabricated sales
 * totals and could create and switch on a payment gateway through the hard-disabled legacy routes,
 * which is exactly what the Store stage is not allowed to ship. Payment operations live in
 * `PaymentOperationsPanel`, read-only, inside the real Store workspace.
 */
export function AdminWorkspace() {
  const [view, setView] = useState<AdminView>('review');

  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'users') setView('users');
      else if (hash === 'packs') setView('packs');
      else if (hash === 'settings') setView('settings');
      else setView('review');
    }
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (view === 'users') return <UsersManagement />;
  if (view === 'packs') return <PackBuilder />;
  if (view === 'settings') return <SettingsPanel />;
  return <ContentReviewWorkspace />;
}

function SettingsPanel() {
  return (
    <div className="settings-panel">
      <h2>تنظیمات</h2>
      <AddPasskeyButton />
    </div>
  );
}
