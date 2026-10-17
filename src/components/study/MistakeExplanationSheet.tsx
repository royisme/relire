/** Snapshot explanations share the exercise API/cache, without changing attempt history. */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchExplanation, MissingApiKeyError } from '../../services/api';
import { getUnit } from '../../storage/exercises';
import type { ExerciseAttempt } from '../../types/exercises';
import type { Explanation } from '../../types/exerciseAi';
import { aiErrorText } from '../../utils/aiErrorText';
import { Button } from '../ui/button';
import { OverlayHeader, Sheet } from '../ui/overlay';
import { InlineMarkup } from '../practice/InlineMarkup';
import { LookupText } from '../reader/LookupText';

interface Props {
  attempt: ExerciseAttempt;
  onClose: () => void;
  onMissingKey: () => void;
  onWord: (word: string, sentence: string) => void;
}

export function MistakeExplanationSheet({ attempt, onClose, onMissingKey, onWord }: Props) {
  const { t } = useTranslation();
  const { unitId, materialId, itemId, prompt, userAnswer, expectedAnswer, grammarTag } = attempt;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ explanation?: Explanation; error?: string } | null>(null);
  // Callbacks are event handlers, not request identities. The mounted sheet owns every reply.
  const [callbacks] = useState(() => ({ onMissingKey }));
  useEffect(() => {
    let live = true;
    const run = async () => {
      try {
        const unit = await getUnit(unitId);
        if (!live) return;
        const context =
          unit?.materialId === materialId && unit.items.some((item) => item.id === itemId)
            ? [unit.instruction, unit.readingPassage?.content].filter(Boolean).join('\n') || undefined
            : undefined;
        const explanation = await fetchExplanation({
          prompt,
          userAnswer,
          expectedAnswer,
          grammarTag,
          context,
        });
        if (live) setResult({ explanation });
      } catch (err) {
        if (!live) return;
        if (err instanceof MissingApiKeyError) callbacks.onMissingKey();
        else setResult({ error: aiErrorText(err) });
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [unitId, materialId, itemId, prompt, userAnswer, expectedAnswer, grammarTag, revision, callbacks]);
  return (
    <Sheet onClose={onClose} label={t('practice.explanationTitle')}>
      <OverlayHeader
        title={t('practice.explanationTitle')}
        subtitle={t(`grammarTags.${attempt.grammarTag}`)}
        onClose={onClose}
        closeLabel={t('common.close')}
      />
      <div className="flex-1 overflow-y-auto space-y-5 px-5 py-4">
        <section className="space-y-2 break-words">
          <p className="font-serif text-lg text-ink-900">
            <LookupText text={attempt.prompt} onWord={onWord} />
          </p>
          <p>
            <span className="text-ink-600">{t('practice.yourAnswer')}: </span>
            <span className="font-serif text-bad-700 line-through">
              <LookupText text={attempt.userAnswer} onWord={onWord} />
            </span>
          </p>
          <p>
            <span className="text-ink-600">{t('practice.expected')}: </span>
            <span className="font-serif text-ok-800">
              <LookupText text={attempt.expectedAnswer} onWord={onWord} />
            </span>
          </p>
        </section>
        <Button
          variant="outline"
          className="w-40"
          disabled={!result}
          onClick={() => {
            setResult(null);
            setRevision((v) => v + 1);
          }}
        >
          {!result && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t(result ? 'common.retry' : 'practice.explaining')}
        </Button>
        {result?.error && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {result.error}
          </p>
        )}
        {result?.explanation && (
          <section className="space-y-3 break-words text-sm text-ink-800">
            <h3 className="font-serif text-base font-semibold">
              <InlineMarkup text={result.explanation.summary} onWord={onWord} />
            </h3>
            {result.explanation.details.split(/\n+/).map((text, index) => (
              <p key={index}>
                <InlineMarkup text={text} onWord={onWord} />
              </p>
            ))}
            <p className="border-t border-ink-200 pt-3">
              <span>{t('practice.tip')}. </span>
              <InlineMarkup text={result.explanation.tip} onWord={onWord} />
            </p>
          </section>
        )}
      </div>
    </Sheet>
  );
}
