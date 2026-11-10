/** The regular rule's ending reference, drawn from engine-produced cell parts, not copied ending tables. */
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import type { VerifiedVerb } from '../../../services/conjugation/verify';
import { FINITE_PERSONS } from '../../../types/grammarPack';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { ruleEndingRows } from './forms';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, ReturnType<typeof ruleEndingRows>[number]>();

export function RuleEndings({ verb }: { verb: VerifiedVerb }) {
  const { t } = useTranslation();
  const data = ruleEndingRows(verb);
  const columns = helper.columns([
    helper.display({
      id: 'tense',
      header: t('conjugation.page.patterns.tense'),
      cell: ({ row }) => t(`conjugation.tenses.${row.original.tense}.name`),
    }),
    ...FINITE_PERSONS.map((person) =>
      helper.display({
        id: person,
        header: t(`conjugation.pronouns.${person}`),
        cell: ({ row }) => {
          const ending = row.original.endings[person];
          return ending === undefined
            ? t('conjugation.page.endings.unavailable')
            : ending === ''
              ? t('conjugation.page.endings.none')
              : ending;
        },
      }),
    ),
  ]);
  const table = useTable({ features, data, columns });
  if (!data.length) return null;
  return (
    <section aria-label={t('conjugation.page.endings.title')} className="border-t border-ink-200 py-5">
      <h3 className="font-serif text-lg font-semibold text-ink-900">{t('conjugation.page.endings.title')}</h3>
      <p className="mt-1 text-sm text-ink-600">{t('conjugation.page.endings.note')}</p>
      <div className="mt-3 rounded-lg border border-ink-200 bg-surface">
        <Table aria-label={t('conjugation.page.endings.title')} className="table-fixed">
          <TableHeader className="bg-ink-50 text-xs">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className="px-1 whitespace-normal break-words text-ink-700 first:w-1/4"
                  >
                    <table.FlexRender header={header} />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getCoreRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="px-1 whitespace-normal break-words text-ink-900">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
