/** Owns a set's exercise columns and number ordering; the set page owns loading and delete confirmation. */
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
import type { UnitRow } from '../../hooks/useUnitRows';
import type { ExerciseUnit } from '../../types/exercises';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
const helper = createColumnHelper<typeof features, UnitRow>();
const classes: Record<string, string> = {
  number: 'hidden sm:table-cell w-16 pl-3 pr-1',
  title: 'px-2',
  type: 'hidden sm:table-cell w-40 px-2',
  items: 'hidden md:table-cell w-20 px-2',
  progress: 'hidden md:table-cell w-40 px-2',
  actions: 'w-12 pl-0 pr-2',
};

export function UnitTable({ rows, onDelete }: { rows: UnitRow[]; onDelete: (unit: ExerciseUnit) => void }) {
  const { t } = useTranslation();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((row) => row.unit.unitNumber, { id: 'number', header: t('practice.colNumber') }),
        helper.accessor((row) => row.unit.title, {
          id: 'title',
          header: t('practice.colTitle'),
          cell: ({
            row: {
              original: { unit, progress },
            },
          }) => (
            <Link
              to={{ name: 'unit', unitId: unit.id }}
              className="block min-w-0 break-words font-serif text-base font-semibold text-ink-900 hover:text-accent-900"
            >
              <span className="sm:hidden">
                {t('practice.numberedTitle', { number: unit.unitNumber, title: unit.title })}
              </span>
              <span className="hidden sm:inline">{unit.title}</span>
              <span className="mt-0.5 block font-sans text-xs font-normal text-ink-500 md:hidden">
                <span className="sm:hidden">{t(`exerciseTypes.${unit.type}.name`)} · </span>
                {t('practice.items', { count: progress.total })}
                <span className="mt-0.5 block">
                  {progress.checked === 0 ? t('practice.notStarted') : t('practice.checkedProgress', { ...progress })}
                </span>
              </span>
            </Link>
          ),
        }),
        helper.accessor((row) => row.unit.type, {
          id: 'type',
          header: t('practice.colType'),
          cell: ({ row }) => t(`exerciseTypes.${row.original.unit.type}.name`),
        }),
        helper.accessor((row) => row.progress.total, { id: 'items', header: t('practice.count') }),
        helper.accessor((row) => row.progress.checked, {
          id: 'progress',
          header: t('practice.colProgress'),
          cell: ({ row }) => {
            const progress = row.original.progress;
            return progress.checked === 0 ? t('practice.notStarted') : t('practice.checkedProgress', { ...progress });
          },
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('practice.actions')}</span>,
          cell: ({ row }) => {
            const label = t('practice.deleteUnitNamed', { title: row.original.unit.title });
            return (
              <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                title={label}
                className="hover:text-bad-700"
                onClick={() => onDelete(row.original.unit)}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            );
          },
        }),
      ]),
    [t, onDelete],
  );
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (row) => row.unit.id,
    defaultColumn: { sortFn: sortFn_basic },
    initialState: { sorting: [{ id: 'number', desc: false }] },
  });
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface">
      <Table className="table-fixed">
        <TableHeader className="border-b border-ink-200 bg-ink-50 text-xs">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="border-0">
              {group.headers.map((header) => (
                <TableHead key={header.id} scope="col" className={classes[header.column.id]}>
                  <table.FlexRender header={header} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="divide-y divide-ink-200">
          {table.getSortedRowModel().rows.map((row) => (
            <TableRow key={row.id} className="border-0 hover:bg-ink-50">
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={`${classes[cell.column.id]} break-words whitespace-normal py-3 ${cell.column.id === 'actions' ? 'align-middle' : 'align-top'} text-ink-600 tnum`}
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
