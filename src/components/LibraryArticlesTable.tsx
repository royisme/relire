/** Owns Library's article columns and sorting; filtering and confirmations stay in LibraryView. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import type { Article } from '../types';
import { cleanArticleTitle, formatLevel } from '../utils/i18nHelpers';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { SortableHeader } from './SortableHeader';

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
const helper = createColumnHelper<typeof features, Article>();
const wordCount = (a: Article) => a.content.split(/\s+/).filter(Boolean).length;
const headings: Record<string, string> = {
  title: 'pl-4 pr-2',
  level: 'hidden sm:table-cell px-2 w-56 whitespace-nowrap',
  words: 'hidden md:table-cell px-2 w-24',
  createdAt: 'hidden md:table-cell px-2 w-32',
  actions: 'w-24 pr-3',
};
const cells: Record<string, string> = {
  title: 'pl-4 pr-2 py-3 align-top whitespace-normal',
  level: 'hidden sm:table-cell px-2 py-3 align-top text-ink-700 whitespace-nowrap',
  words: 'hidden md:table-cell px-2 py-3 align-top text-ink-700 tnum',
  createdAt: 'hidden md:table-cell px-2 py-3 align-top text-ink-600 whitespace-normal',
  actions: 'pr-2 pl-0 py-1.5 align-top',
};

export function LibraryArticlesTable({
  articles,
  sorting,
  onSortingChange,
  onOpen,
  onEdit,
  onDelete,
}: {
  articles: Article[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  onOpen: (article: Article) => void;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
}) {
  const { t, i18n } = useTranslation();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((a) => cleanArticleTitle(a.title).toLowerCase(), {
          id: 'title',
          header: t('library.colTitle'),
          sortDescFirst: false,
          cell: ({ row: { original: a } }) => (
            <button onClick={() => onOpen(a)} className="block text-left cursor-pointer max-w-full">
              <span className="block font-serif text-base font-semibold text-ink-900 hover:text-accent-900">
                {cleanArticleTitle(a.title)}
              </span>
              <span className="block text-xs text-ink-500 mt-0.5">
                <span className="sm:hidden">{formatLevel(a.level, i18n.language)} · </span>
                {[a.category, a.source].filter(Boolean).join(' · ')}
              </span>
            </button>
          ),
        }),
        helper.accessor('level', {
          header: t('library.colLevel'),
          sortDescFirst: false,
          cell: ({ row }) => formatLevel(row.original.level, i18n.language),
        }),
        helper.accessor(wordCount, { id: 'words', header: t('library.colWords'), sortDescFirst: true }),
        helper.accessor('createdAt', {
          header: t('library.colAdded'),
          sortDescFirst: true,
          cell: ({ row }) => {
            const iso = row.original.createdAt;
            const d = new Date(iso);
            return isNaN(d.getTime())
              ? iso
              : d.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
          },
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('library.actions')}</span>,
          cell: ({ row: { original: a } }) => (
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(a)}
                aria-label={t('library.edit')}
                title={t('library.edit')}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(a)}
                aria-label={t('library.delete')}
                title={t('library.delete')}
                className="hover:text-bad-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ),
        }),
      ]),
    [t, i18n.language, onOpen, onEdit, onDelete],
  );
  const table = useTable({
    features,
    columns,
    data: articles,
    getRowId: (a) => a.id,
    defaultColumn: { sortFn: sortFn_basic },
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting },
    onSortingChange,
  });
  return (
    <div className="rounded-lg border border-ink-200 bg-surface overflow-hidden">
      <Table>
        <TableHeader className="border-b border-ink-200 bg-ink-50 text-xs">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="border-0 text-left">
              {group.headers.map((header) =>
                header.column.getCanSort() ? (
                  <SortableHeader
                    key={header.id}
                    className={headings[header.column.id]}
                    direction={header.column.getIsSorted()}
                    onToggle={() => header.column.toggleSorting()}
                  >
                    <table.FlexRender header={header} />
                  </SortableHeader>
                ) : (
                  <TableHead key={header.id} scope="col" className={headings[header.column.id]}>
                    <table.FlexRender header={header} />
                  </TableHead>
                ),
              )}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="divide-y divide-ink-200">
          {table.getSortedRowModel().rows.map((row) => (
            <TableRow key={row.id} className="border-0 hover:bg-ink-50">
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cells[cell.column.id]}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
