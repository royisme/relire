/**
 * One unit on one sheet: a single bordered surface with the title and
 * instruction, numbered hairline rows, and a footer with "Check all", the unit
 * reset and one status line. It draws the state of `useExerciseUnit` and keeps
 * only what is about this screen: the field the character bar types into, the
 * open explanation and the open reset confirmation. A READING_CLOZE unit's
 * passage sits beside the questions from `md` (stacked above them on phones)
 * and links to the material in the reader.
 */
import { useState } from 'react';
import { ArrowLeft, ListChecks, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ExerciseUnitSession } from '../../hooks/useExerciseUnit';
import { effectiveItemType, type ExerciseUnit } from '../../types/exercises';
import { Button } from '../ui/button';
import { Link } from '../shell/Link';
import { CharacterBar } from './CharacterBar';
import type { TextInputElement } from './controls/types';
import { ExplanationSheet } from './ExplanationSheet';
import { ItemRow } from './ItemRow';
import { ResetDialog } from './ResetDialog';

/** The unit's reading passage, and for a cloze unit the way back into the material. */
function PassageSection({ unit, beside }: { unit: ExerciseUnit; beside: boolean }) {
  const { t } = useTranslation();
  const passage = unit.readingPassage!;
  return (
    <section
      className={`space-y-2 whitespace-pre-wrap break-words px-4 py-5 sm:px-6 ${
        beside ? 'border-b border-ink-200 md:border-b-0 md:border-r' : 'border-b border-ink-200'
      }`}
    >
      {passage.title && <h3 className="font-serif text-lg font-semibold text-ink-900">{passage.title}</h3>}
      <p lang="fr" className="font-serif text-lg leading-relaxed text-ink-900">
        {passage.content}
      </p>
      {passage.translation && <p className="text-sm leading-relaxed text-ink-600">{passage.translation}</p>}
      {beside && (
        <Link
          to={{ name: 'reader', articleId: unit.materialId }}
          className="inline-flex h-10 items-center rounded-md text-sm font-medium text-accent-900 hover:underline underline-offset-4"
        >
          {t('practice.openInReader')}
        </Link>
      )}
    </section>
  );
}

export function UnitSheet({ unit, session }: { unit: ExerciseUnit; session: ExerciseUnitSession }) {
  const { t } = useTranslation();
  const [bound, setBound] = useState<TextInputElement | null>(null);
  const [explainId, setExplainId] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const { items, progress } = session;
  const explained = unit.items.find((item) => item.id === explainId);
  const anyChecking = unit.items.some((item) => items[item.id]?.busy === 'check');
  // A cloze unit's questions are answered with the passage in sight, so from `md` it stays beside them.
  const cloze = unit.type === 'READING_CLOZE' && unit.readingPassage;

  const explain = (itemId: string) => {
    setExplainId(itemId);
    void session.requestExplanation(itemId);
  };

  const rows = (
    <ol className="min-w-0 px-4 sm:px-6">
      {unit.items.map((item) => (
        <ItemRow
          key={item.id}
          unit={unit}
          item={item}
          runtime={items[item.id]}
          onAnswer={(answer) => session.setAnswer(item.id, answer)}
          onCheck={() => void session.check(item.id)}
          onHint={() => void session.requestHint(item.id)}
          onExplain={() => explain(item.id)}
          onBind={setBound}
        />
      ))}
    </ol>
  );

  const reset = async () => {
    if (await session.reset()) {
      setConfirmingReset(false);
      setExplainId(null);
      setBound(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-28 pt-6 sm:px-6">
      <Link
        to={{ name: 'practice', articleId: unit.materialId }}
        className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>{t('practice.title')}</span>
      </Link>

      <section aria-labelledby="unit-title" className="rounded-lg border border-ink-200 bg-surface">
        <header className="space-y-1 border-b border-ink-200 px-4 py-5 sm:px-6">
          <p className="text-xs text-ink-500">{t(`exerciseTypes.${unit.type}.name`)}</p>
          <h2 id="unit-title" className="break-words font-serif text-2xl font-semibold text-ink-900">
            {unit.title}
          </h2>
          <p className="break-words text-sm text-ink-700">{unit.instruction}</p>
          {unit.example && (
            <p className="break-words text-sm text-ink-500">
              {t('practice.example')}: {unit.example}
            </p>
          )}
        </header>

        {cloze ? (
          <div className="md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <PassageSection unit={unit} beside />
            {rows}
          </div>
        ) : (
          <>
            {unit.readingPassage && <PassageSection unit={unit} beside={false} />}
            {rows}
          </>
        )}

        <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-200 px-4 py-3 sm:px-6">
          <Button onClick={() => void session.checkAll()} disabled={progress.pending === 0}>
            {anyChecking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{t('practice.checkAll')}</span>
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingReset(true)}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>{t('practice.resetUnit')}</span>
          </Button>
          {session.saveError ? (
            <p role="alert" className="min-h-5 min-w-0 break-words text-sm text-bad-700 sm:ml-auto">
              {t('practice.saveFailed', { msg: session.saveError })}
            </p>
          ) : (
            <p aria-live="polite" className="tnum min-h-5 text-sm text-ink-600 sm:ml-auto">
              {t('practice.progress', { checked: progress.checked, total: progress.total, correct: progress.correct })}
            </p>
          )}
        </footer>
      </section>

      <CharacterBar target={bound} />

      {explained && items[explained.id] && (
        <ExplanationSheet
          item={explained}
          type={effectiveItemType(explained, unit)}
          runtime={items[explained.id]}
          onClose={() => setExplainId(null)}
          onRetry={() => void session.requestExplanation(explained.id)}
        />
      )}

      {confirmingReset && (
        <ResetDialog
          title={unit.title}
          busy={session.resetting}
          error={session.resetError}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() => void reset()}
        />
      )}
    </div>
  );
}
