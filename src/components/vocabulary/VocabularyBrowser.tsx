/** Paginated merged dictionary: house Table plus TanStack v9; no giant catalogue DOM or mastery labels. */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import type { VocabularyBook, VocabularyRow } from '../../types/vocabulary';
import { joinVocabulary, type VocabularyJoined } from '../../services/vocabulary/queue';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Segmented } from '../ui/segmented';
import { Link } from '../shell/Link';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '../ui/table';
import { VocabularyDetails } from './VocabularyDetails';
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, VocabularyJoined>();
export function VocabularyBrowser({ rows, book }: { rows: VocabularyRow[]; book?: VocabularyBook }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'all' | 'builtIn' | 'bookmarked'>('all');
  const [phase, setPhase] = useState<'all' | 'unintroduced' | 'learning' | 'review'>('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const joined = useMemo(() => joinVocabulary(rows, book), [rows, book]);
  const filtered = joined.filter((word) => {
    if ((source === 'builtIn' && !word.builtIn) || (source === 'bookmarked' && !word.row?.bookmarked)) return false;
    const state = !word.row?.schedule ? 'unintroduced' : word.row.schedule.phase === 'review' ? 'review' : 'learning';
    if (phase !== 'all' && phase !== state) return false;
    const text = [
      word.word,
      ...(word.bookSource?.senses.flatMap((s) => [s.gloss.en, s.gloss.zh]) ?? []),
      ...(word.row?.contexts.flatMap((c) => [c.sentence, c.analysis.translation, c.analysis.translationEn ?? '']) ??
        []),
    ].join(' ');
    return text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  });
  const last = Math.max(0, Math.ceil(filtered.length / 50) - 1);
  const current = Math.min(page, last);
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('word', {
          header: t('vocab.word'),
          cell: ({ row }) => (
            <Button
              variant="ghost"
              className="h-auto min-h-10 max-w-full whitespace-normal text-left font-serif text-lg"
              onClick={() => setSelected(row.original.key)}
            >
              {row.original.word}
            </Button>
          ),
        }),
        helper.display({
          id: 'source',
          header: t('vocab.source'),
          cell: ({ row: { original: word } }) =>
            [word.builtIn ? t('vocab.builtIn') : '', word.row?.bookmarked ? t('vocab.bookmarked') : '']
              .filter(Boolean)
              .join(' · '),
        }),
      ]),
    [t],
  );
  const table = useTable({
    features,
    columns,
    data: filtered.slice(current * 50, (current + 1) * 50),
    getRowId: (word) => word.key,
  });
  const detail = joined.find((word) => word.key === selected);
  return (
    <div className="space-y-4">
      <Link
        to={{ name: 'wordsReview' }}
        className="inline-flex min-h-10 items-center rounded-md border border-ink-300 px-4 text-sm"
      >
        {t('vocab.reviewDue')}
      </Link>
      <Input
        type="search"
        aria-label={t('vocab.search')}
        placeholder={t('vocab.search')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
      />
      <Segmented
        label={t('vocab.source')}
        value={source}
        onChange={(value) => {
          setSource(value);
          setPage(0);
        }}
        options={(['all', 'builtIn', 'bookmarked'] as const).map((value) => ({ value, label: t(`vocab.${value}`) }))}
      />
      <Segmented
        label={t('vocab.state')}
        value={phase}
        onChange={(value) => {
          setPhase(value);
          setPage(0);
        }}
        options={(['all', 'unintroduced', 'learning', 'review'] as const).map((value) => ({
          value,
          label: t(`vocab.${value}`),
        }))}
      />
      <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
        <Table>
          <TableHeader className="bg-ink-50 text-xs">
            <TableRow>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <TableHead key={header.id} scope="col">
                  <table.FlexRender header={header} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-ink-200">
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-ink-50">
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="whitespace-normal break-words">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!filtered.length && <p className="text-sm text-ink-600">{t('vocab.noResults')}</p>}
      {!book && <p className="text-sm text-ink-600">{t('vocab.bookUnavailable')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
          {t('vocab.previous')}
        </Button>
        <span className="tnum text-sm">{t('vocab.page', { page: current + 1, total: last + 1 })}</span>
        <Button variant="outline" disabled={current === last} onClick={() => setPage(current + 1)}>
          {t('vocab.next')}
        </Button>
      </div>
      {detail && <VocabularyDetails key={detail.key} word={detail} onClose={() => setSelected(null)} />}
    </div>
  );
}
