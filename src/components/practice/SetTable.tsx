/** Owns the exercise-set table and sorting; PracticePage owns filtering and delete confirmation. */
import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import type { SetRow } from '../../services/exercises/sets';
import { Link } from '../shell/Link';
import { SortableHeader } from '../SortableHeader';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
const helper = createColumnHelper<typeof features, SetRow>();
const classes: Record<string, string> = {
  title: 'pl-4 pr-2',
  level: 'hidden sm:table-cell w-20 px-2',
  exercises: 'hidden md:table-cell w-24 px-2',
  progress: 'w-24 sm:w-32 px-2',
  createdAt: 'hidden md:table-cell w-32 px-2',
  actions: 'w-12 pr-2 pl-0',
};

export function SetTable({ sets, onDelete }: { sets: SetRow[]; onDelete: (set: SetRow) => void }) {
  const { t, i18n } = useTranslation();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((set) => set.title.toLowerCase(), {
          id: 'title',
          header: t('practice.colTitle'),
          sortDescFirst: false,
          cell: ({ row: { original: set } }) => (
            <Link to={{ name: 'practiceSet', setId: set.setId }} className="block min-w-0 break-words">
              <span className="block font-serif text-base font-semibold text-ink-900 hover:text-accent-900">
                {set.title}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                <span className="sm:hidden">{t(`levels.${set.level}`)} · </span>
                {t('practice.exercises', { count: set.rows.length })}
                {set.types.length === 1 && <> · {t(`exerciseTypes.${set.types[0]}.name`)}</>}
              </span>
            </Link>
          ),
        }),
        helper.accessor('level', {
          header: t('practice.level'),
          sortDescFirst: false,
          cell: ({ row }) => t(`levels.${row.original.level}`),
        }),
        helper.accessor((set) => set.rows.length, {
          id: 'exercises',
          header: t('practice.colExercises'),
          enableSorting: false,
        }),
        helper.accessor((set) => set.progress.checked / set.progress.total, {
          id: 'progress',
          header: t('practice.colProgress'),
          sortDescFirst: true,
          cell: ({ row }) => {
            const { checked, total } = row.original.progress;
            return checked === 0 ? t('practice.notStarted') : t('practice.checkedProgress', { checked, total });
          },
        }),
        helper.accessor('createdAt', {
          header: t('practice.colAdded'),
          sortDescFirst: true,
          cell: ({ row }) =>
            new Date(row.original.createdAt).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('practice.actions')}</span>,
          cell: ({ row }) => {
            const label = t('practice.deleteSetNamed', { title: row.original.title });
            return (
              <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                title={label}
                onClick={() => onDelete(row.original)}
                className="hover:text-bad-700"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            );
          },
        }),
      ]),
    [t, i18n.language, onDelete],
  );
  const table = useTable({
    features,
    columns,
    data: sets,
    getRowId: (set) => set.setId,
    defaultColumn: { sortFn: sortFn_basic },
    enableSortingRemoval: false,
    enableMultiSort: false,
    initialState: { sorting: [{ id: 'createdAt', desc: true }] },
  });
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
      <Table className="table-fixed">
        <TableHeader className="border-b border-ink-200 bg-ink-50 text-xs">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="border-0">
              {group.headers.map((header) =>
                header.column.getCanSort() ? (
                  <SortableHeader
                    key={header.id}
                    className={classes[header.column.id]}
                    direction={header.column.getIsSorted()}
                    onToggle={() => header.column.toggleSorting()}
                  >
                    <table.FlexRender header={header} />
                  </SortableHeader>
                ) : (
                  <TableHead key={header.id} scope="col" className={classes[header.column.id]}>
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
                <TableCell
                  key={cell.id}
                  className={`${classes[cell.column.id]} py-3 align-top whitespace-normal break-words text-ink-600 ${cell.column.id !== 'title' ? 'tnum' : ''}`}
                >
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
