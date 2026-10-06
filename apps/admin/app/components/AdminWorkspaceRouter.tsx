'use client';

import React, { useEffect, useState } from 'react';

import { ContentPacksWorkspace } from './ContentPacksWorkspace';
import { ContentReviewWorkspace } from './ContentReviewWorkspace';
import { StoreListingsWorkspace } from './StoreListingsWorkspace';

/**
 * Minimal hash router for the approved Admin navigation model. Milestone 1.1 made two destinations
 * real — «خانه / نمای کلی» (the existing, real Content Review workspace) and «محتوا و بسته‌ها».
 * Milestone 2.1 adds «فروشگاه», the commercial listing surface, so navigation works in every
 * direction without forking any screen.
 */
type AdminRoute = 'content' | 'store' | 'home';

function readRoute(hash: string): AdminRoute {
  const value = hash.replace(/^#/, '');
  if (value === 'content') return 'content';
  if (value === 'store') return 'store';
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
  return <ContentReviewWorkspace />;
}
