'use client';

import React, { useEffect, useState } from 'react';

import { ContentPacksWorkspace } from './ContentPacksWorkspace';
import { ContentReviewWorkspace } from './ContentReviewWorkspace';

/**
 * Minimal hash router for the approved Admin navigation model. Milestone 1.1 makes exactly two
 * destinations real — «خانه / نمای کلی» (the existing, real Content Review workspace) and
 * «محتوا و بسته‌ها» — so navigation works in both directions without forking either screen.
 */
function readRoute(hash: string): 'content' | 'home' {
  return hash.replace(/^#/, '') === 'content' ? 'content' : 'home';
}

export function AdminWorkspaceRouter() {
  const [route, setRoute] = useState<'content' | 'home'>('home');

  useEffect(() => {
    const sync = () => setRoute(readRoute(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return route === 'content' ? <ContentPacksWorkspace /> : <ContentReviewWorkspace />;
}
