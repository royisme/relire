/**
 * Open oral assessment: step through the article's sentences, hear one, read it
 * aloud and get the AI's pronunciation score. This is the scored reading-aloud
 * outside the sentence sheet; the recording itself is `ShadowingRecorder`.
 * Does not touch exercises.
 */
import { useMemo } from 'react';
import { navigate } from '../../hooks/useRoute';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Article, PronunciationAssessment } from '../../types';
import { splitArticle } from '../../utils/sentences';
import { ShadowingRecorder } from '../shadowing/ShadowingRecorder';
import { Button } from '../ui/button';
import { SpeakButton } from '../ui/speak-button';

interface OralPracticeProps {
  article: Article;
  index: number;
  onAssessed: (assessment: PronunciationAssessment, sentence: string) => void;
}

export function OralPractice({ article, index, onAssessed }: OralPracticeProps) {
  const { t } = useTranslation();
  const sentences = useMemo(() => splitArticle(article.content).flat(), [article.content]);
  const current = sentences[index];
  const setIndex = (next: number) =>
    navigate({ name: 'readAloud', articleId: article.id, sentence: sentences[next].text });
  if (!current) return null;
  const at = sentences.indexOf(current);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tnum text-sm text-ink-600" aria-live="polite">
          {t('practice.sentenceOf', { current: at + 1, total: sentences.length })}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIndex(at - 1)}
            disabled={at === 0}
            aria-label={t('practice.previousSentence')}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIndex(at + 1)}
            disabled={at === sentences.length - 1}
            aria-label={t('practice.nextSentence')}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p className="break-words font-serif text-xl leading-relaxed text-ink-900">« {current.text} »</p>

      <SpeakButton
        text={current.text}
        rate={0.85}
        label={t('practice.listenSlowly')}
        stopLabel={t('reader.stop')}
        variant="outline"
        showLabel
      />

      <ShadowingRecorder key={current.id} referenceText={current.text} onAssessed={onAssessed} quiet />
    </div>
  );
}
