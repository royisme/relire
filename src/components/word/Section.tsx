/** One titled section of the word sheet, set off by a rule, not a tinted box; the title is the strongest line of the section. Owns that frame only. */
import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-5 border-t border-ink-200 space-y-2">
      <h4 className="font-serif text-base font-semibold text-ink-900">{title}</h4>
      {children}
    </section>
  );
}
