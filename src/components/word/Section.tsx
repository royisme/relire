/** One titled section of the word sheet, set off by a rule, not a tinted box. Owns that frame only. */
import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-5 border-t border-ink-200 space-y-2">
      <h4 className="text-xs font-medium text-ink-500">{title}</h4>
      {children}
    </section>
  );
}
