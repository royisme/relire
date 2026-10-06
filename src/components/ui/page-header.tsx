import * as React from 'react';

/** The top of a tab: serif title, one quiet line under it, actions on the right (wrapping below on phones). */
export const PageHeader: React.FC<{ title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div className="min-w-0">
      <h2 className="font-serif text-2xl font-semibold text-ink-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-ink-500 break-words">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
