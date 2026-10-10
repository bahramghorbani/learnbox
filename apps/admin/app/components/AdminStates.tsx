import React from 'react';

/**
 * Shared Loading / Empty / Error patterns — Stage 0 of
 * `docs/planning/ADMIN_UI_IMPLEMENTATION_PLAN.md`.
 *
 * Markup and class names come from the APPROVED, DESIGN FROZEN prototype (PDR-009):
 * `prototypes/admin-ui-v1/empty.html` (`bigEmpty`) and `error.html` (`errBlock`) on
 * `proto/admin-ui-concept` @ 8b3e050d. Styles live in `app/globals.css`.
 *
 * No prototype demo data is carried over: every string is supplied by the caller from real
 * application state. These components render what they are given and nothing else.
 */

type IconName = 'inbox' | 'alert' | 'shield' | 'search';

/** Inline, so the shared patterns need no icon dependency and no network request. */
function StateIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  if (name === 'alert') {
    return (
      <svg {...common}>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9 2.4 17.6A1.9 1.9 0 0 0 4 20.5h16a1.9 1.9 0 0 0 1.6-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 21s7-3.3 7-9V6l-7-3-7 3v6c0 5.7 7 9 7 9Z" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 13h4l2 3h6l2-3h4" />
      <path d="M5 13 7 5h10l2 8v6H5Z" />
    </svg>
  );
}

/**
 * Waiting for real data. `aria-live="polite"` so a screen reader announces the wait without
 * stealing focus, and the spinner is decorative only — the label carries the meaning.
 */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={className ? `admin-state-row ${className}` : 'admin-state-row'}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/**
 * Nothing to show yet. `variant="compact"` fits a table cell or drawer, `"page"` fills a panel.
 * An empty state is not an error, so it is announced as a status, not an alert.
 */
export function EmptyState({
  title,
  description,
  icon = 'inbox',
  variant = 'compact',
  action,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  variant?: 'compact' | 'page';
  action?: React.ReactNode;
}) {
  if (variant === 'page') {
    return (
      <div className="empty-xl" role="status">
        <div className="e-ic-xl">
          <StateIcon name={icon} />
        </div>
        <div className="e-title">{title}</div>
        {description ? <div className="e-text">{description}</div> : null}
        {action ? <div className="e-cta">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className="empty" role="status">
      <div className="e-ic">
        <StateIcon name={icon} />
      </div>
      <div className="e-title">{title}</div>
      {description ? <div className="e-text">{description}</div> : null}
      {action ? <div className="e-cta">{action}</div> : null}
    </div>
  );
}

/**
 * Something failed. Per the reference, an error says what happened AND what to do next, so
 * `description` is required and `action` is encouraged. `role="alert"` because a failure the
 * operator did not ask for must interrupt.
 *
 * Tones match the reference: `rose` = it broke, `amber` = you are not allowed, `grey` = not found.
 */
export function ErrorState({
  title,
  description,
  tone = 'rose',
  action,
}: {
  title: string;
  description: string;
  tone?: 'rose' | 'amber' | 'grey';
  action?: React.ReactNode;
}) {
  const icon: IconName = tone === 'amber' ? 'shield' : tone === 'grey' ? 'search' : 'alert';
  return (
    <div className={`err-block ${tone}`} role="alert">
      <div className="err-ic">
        <StateIcon name={icon} />
      </div>
      <div className="err-body">
        <div className="e-title">{title}</div>
        <div className="e-text">{description}</div>
        {action ? <div className="e-cta">{action}</div> : null}
      </div>
    </div>
  );
}
