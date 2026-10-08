'use client';

import React, { useEffect, useState } from 'react';
import { ContentReviewWorkspace } from './ContentReviewWorkspace';
import { UsersManagement } from './UsersManagement';
import { PackBuilder } from './PackBuilder';
import { FinancePanel } from './FinancePanel';
import { AddPasskeyButton } from './AddPasskeyButton';

type AdminView = 'review' | 'users' | 'packs' | 'finance' | 'settings';

export function AdminWorkspace() {
  const [view, setView] = useState<AdminView>('review');

  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'users') setView('users');
      else if (hash === 'packs') setView('packs');
      else if (hash === 'finance') setView('finance');
      else if (hash === 'settings') setView('settings');
      else setView('review');
    }
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  if (view === 'users') return <UsersManagement />;
  if (view === 'packs') return <PackBuilder />;
  if (view === 'finance') return <FinancePanel />;
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
