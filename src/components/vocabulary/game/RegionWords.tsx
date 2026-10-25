import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyEntry, VocabularyRow } from '../../../types/vocabulary';
import { contextOf, tierOf } from '../../../services/vocabulary/game/collection';
import { Button } from '../../ui/button';
import { LeechContext } from './LeechContext';

/** Mounted only for an open group; personal and leech groups can be larger than a book page. */
export function RegionWords({
  keys,
  rows,
  entries,
  leeches = false,
}: {
  keys: readonly string[];
  rows: ReadonlyMap<string, VocabularyRow>;
  entries: ReadonlyMap<string, VocabularyEntry>;
  leeches?: boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(keys.length / 50) - 1);
  const current = Math.min(page, last);
  const start = current * 50;
  return (
    <div>
      <div className="flex h-16 items-center justify-between gap-2 text-xs">
        <Button variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
          {t('vocab.previous')}
        </Button>
        <p className="tnum">
          {t('vocab.map.range', {
            from: keys.length ? start + 1 : 0,
            to: Math.min(start + 50, keys.length),
            total: keys.length,
          })}
        </p>
        <Button variant="ghost" disabled={current === last} onClick={() => setPage(current + 1)}>
          {t('vocab.next')}
        </Button>
      </div>
      <ul className="divide-y divide-ink-200">
        {keys.slice(start, start + 50).map((key) => {
          const row = rows.get(key);
          return (
            <li key={key} className="space-y-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span lang="fr" className="min-w-0 break-words font-serif text-lg">
                  {row?.word ?? entries.get(key)!.word}
                </span>
                <span className="text-xs text-ink-600">
                  {row ? t(`vocab.map.tier.${tierOf(row)}`) : t('vocab.map.unseen')}
                </span>
              </div>
              {leeches && row && <LeechContext context={{ ...contextOf(row), lapses: row.schedule!.lapses }} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
