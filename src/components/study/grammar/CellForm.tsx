/** A cell's written form, highlighting only endings split by the engine; leads and clitics stay plain. */
import { Fragment } from 'react';
import type { CheckedCell } from '../../../services/conjugation/verify';
import { cellText } from './forms';

export function CellForm({ cell }: { cell: Pick<CheckedCell, 'lead' | 'forms' | 'parts'> }) {
  if (!cell.parts) return <>{cellText(cell)}</>;
  return (
    <>
      {cell.lead}
      {cell.lead && !cell.lead.endsWith('’') ? ' ' : ''}
      {cell.parts.map(({ stem, ending, clitic }, index) => (
        <Fragment key={cell.forms[index]}>
          {index > 0 && ' / '}
          {stem}
          <span className="font-semibold underline decoration-ink-500 underline-offset-4">{ending}</span>
          {clitic}
        </Fragment>
      ))}
    </>
  );
}
