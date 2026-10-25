/** A read-only picture of the learner's regions. Lists mount only while their group is open. */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../../hooks/useVocabulary';
import type { VocabularyBookModel } from '../../../hooks/useVocabularyBook';
import type { VocabularyEntry, VocabularyRow } from '../../../types/vocabulary';
import { leechesOf } from '../../../services/vocabulary/game/collection';
import {
  LEECH_LAPSES,
  OTHER_REGION_ID,
  SAVED_REGION_ID,
  summarizeRegions,
  type RegionCounts,
} from '../../../services/vocabulary/game/regions';
import { Link } from '../../shell/Link';
import { Button } from '../../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { RegionWords } from './RegionWords';

export function RegionPicture({ counts }: { counts: RegionCounts }) {
  const { t } = useTranslation();
  // Introduced and leech overlap the tiers. Only disjoint states can partition a bar honestly.
  const segments = [
    { label: t('vocab.map.unseen'), count: counts.unseen },
    { label: t('vocab.map.tier.new'), count: counts.introduced - counts.learning - counts.young - counts.mature },
    { label: t('vocab.map.tier.learning'), count: counts.learning },
    { label: t('vocab.map.tier.young'), count: counts.young },
    { label: t('vocab.map.tier.mature'), count: counts.mature },
  ];
  return (
    <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {(['introduced', 'learning', 'young', 'mature', 'leech', 'unseen', 'total'] as const).map((name) => (
          <div key={name} className="flex gap-1">
            <dt className="text-ink-600">{t(`vocab.map.${name}`)}</dt>
            <dd className="tnum">{counts[name]}</dd>
          </div>
        ))}
      </dl>
      <div role="img" aria-label={t('vocab.map.picture')} className="flex h-10 w-full">
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => (
            <div
              key={segment.label}
              style={{ flexGrow: segment.count, flexBasis: 0 }}
              title={t('vocab.map.segment', { label: segment.label, words: segment.count })}
              className="flex min-w-0 items-center justify-center overflow-hidden border border-ink-300 px-0.5 text-xs"
            >
              <span className="truncate">{t('vocab.map.segment', { label: segment.label, words: segment.count })}</span>
            </div>
          ))}
      </div>
      <p className="text-xs text-ink-600">
        {segments.map((segment) => t('vocab.map.segment', { label: segment.label, words: segment.count })).join(' · ')}
      </p>
    </div>
  );
}

function MapGroup({
  title,
  keys,
  rows,
  entries,
  children,
  leeches = false,
}: {
  title: string;
  keys: readonly string[];
  rows: ReadonlyMap<string, VocabularyRow>;
  entries: ReadonlyMap<string, VocabularyEntry>;
  children?: ReactNode;
  leeches?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3 border-t border-ink-200 py-4">
      <h3>
        <CollapsibleTrigger className="flex min-h-10 w-full flex-wrap items-center justify-between gap-2 text-left">
          <span className="min-w-0 break-words font-serif text-lg font-semibold">{title}</span>
          <span className="text-xs text-ink-600">{t(open ? 'vocab.map.hideWords' : 'vocab.map.showWords')}</span>
        </CollapsibleTrigger>
      </h3>
      {children}
      {leeches && keys.length === 0 && <p className="text-sm text-ink-600">{t('vocab.map.noLeeches')}</p>}
      <CollapsibleContent>
        {open && <RegionWords keys={keys} rows={rows} entries={entries} leeches={leeches} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function VocabularyMap({ model, content }: { model: VocabularyModel; content: VocabularyBookModel }) {
  const { t } = useTranslation();
  const ready = model.ready && !content.busy;
  const regions = summarizeRegions({ rows: model.rows, book: content.book }).filter(
    (region) => region.counts.total > 0,
  );
  const rows = new Map(model.rows.map((row) => [row.key, row]));
  const entries = new Map(content.book?.entries.map((entry) => [entry.key, entry]));
  const leeches = leechesOf(model.rows, LEECH_LAPSES);
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-semibold">{t('vocab.map.title')}</h2>
      <p className="text-sm text-ink-600">{t('vocab.map.overlap')}</p>
      <div
        role={content.error ? 'alert' : 'status'}
        aria-busy={!ready && !model.error && !content.error}
        className="flex h-16 items-start gap-2 overflow-auto break-words text-sm"
      >
        {content.error ? (
          <>
            <p className="min-w-0 flex-1 text-bad-700">{content.error}</p>
            {content.configured && (
              <Button variant="outline" disabled={content.busy} onClick={() => void content.download()}>
                {t('common.retry')}
              </Button>
            )}
          </>
        ) : !ready && !model.error ? (
          t('common.loading')
        ) : null}
      </div>
      {ready && !model.error && (
        <>
          {regions.length === 0 && !content.error ? (
            <div className="space-y-2 text-sm">
              <p>{t('vocab.map.empty')}</p>
              <Link to={{ name: 'wordsAll' }} className="inline-flex min-h-10 items-center text-accent-900 underline">
                {t('vocab.allWords')}
              </Link>
            </div>
          ) : (
            regions.map((region, index) => (
              <MapGroup
                key={region.id}
                title={
                  region.positions
                    ? t('vocab.map.page', { page: index + 1 })
                    : region.id === SAVED_REGION_ID
                      ? t('vocab.map.saved')
                      : region.id === OTHER_REGION_ID
                        ? t('vocab.map.other')
                        : region.title
                }
                keys={region.keys}
                rows={rows}
                entries={entries}
              >
                {region.positions && (
                  <p className="tnum text-xs text-ink-600">{t('vocab.map.positions', region.positions)}</p>
                )}
                {region.tags && region.tags.length > 0 && (
                  <p className="break-words text-xs text-ink-600">{region.tags.join(' · ')}</p>
                )}
                <RegionPicture counts={region.counts} />
              </MapGroup>
            ))
          )}
          <MapGroup
            title={t('vocab.map.leeches', { words: leeches.length })}
            keys={leeches.map((row) => row.key)}
            rows={rows}
            entries={entries}
            leeches
          />
        </>
      )}
    </section>
  );
}
