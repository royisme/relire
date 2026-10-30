/**
 * The plaque at the foot of the baseplate: why a brick is wrong, what fused, the verdict, the real error, or
 * (when there is nothing to say) how far the build is. Its height is fixed until a message needs more room, which the plate's spare space takes.
 * Owns the wording of the round's note.
 */
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Turn } from '../../services/atelier/roundState';

function Message({ turn, language, total }: { turn: Turn; language: 'zh' | 'en'; total: number }) {
  const { t } = useTranslation();
  const reasonOf = (id: string) => (
    <p key={id} className="break-words">
      {turn.pieces.find((piece) => piece.id === id)!.reason![language]}
    </p>
  );
  const { note } = turn;
  if (!turn.revealed && !turn.right && !note)
    return (
      <p className="atelier-slip tnum" data-kind="idle">
        {turn.placed.length === 0
          ? t('atelier.round.rowEmpty')
          : t('atelier.round.placed', { count: turn.placed.length, total })}
      </p>
    );
  if (turn.revealed)
    return (
      <div className="atelier-slip" data-kind="note">
        <p className="break-words">{t('atelier.round.revealed')}</p>
      </div>
    );
  if (turn.right)
    return (
      <div className="atelier-slip flex items-center gap-1.5 font-semibold" data-kind="ok">
        <Check className="h-4 w-4" aria-hidden="true" />
        {t('atelier.round.right')}
      </div>
    );
  if (!note) return null;
  if (note.kind === 'fused')
    return (
      <div className="atelier-slip" data-kind="note">
        <p className="break-words">
          {t('atelier.round.fused', { a: note.parts[0], b: note.parts[1], fused: note.into })}
        </p>
      </div>
    );
  if (note.kind === 'error')
    return (
      <div role="alert" className="atelier-slip" data-kind="bad">
        <p className="break-words">{t('atelier.round.gradeFailed', { msg: note.message })}</p>
      </div>
    );
  const flagged = turn.placed.filter((id) => turn.pieces.find((piece) => piece.id === id)!.reason);
  return (
    <div className="atelier-slip flex gap-1.5" data-kind="bad">
      <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {note.kind === 'distractor' ? (
          reasonOf(note.pieceId)
        ) : note.feedback ? (
          <p className="break-words">{note.feedback}</p>
        ) : flagged.length > 0 ? (
          <>
            <p>{t('atelier.round.flagged')}</p>
            {flagged.map(reasonOf)}
          </>
        ) : (
          <p>{t('atelier.round.notQuite')}</p>
        )}
      </div>
    </div>
  );
}

export function Slip({ turn, language, total }: { turn: Turn; language: 'zh' | 'en'; total: number }) {
  return (
    <div aria-live="polite" className="mt-2 flex min-h-[3rem] shrink-0 flex-col justify-end">
      <Message turn={turn} language={language} total={total} />
    </div>
  );
}
