/**
 * The optional AI examples of a word card: saved ones render in the card's example style under the app's
 * AI label. When no example exists anywhere on the card, one ghost button asks the learner's own key for
 * two sentences and saves them additively on the row; the button owns its pending state and shows the real
 * error in place. Never automatic, never in bulk, and no example is offered without a stored row.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { VocabularyJoined } from '../../services/vocabulary/queue';
import { getAiAccess } from '../../services/ai/access';
import { generateWordExamples } from '../../services/api';
import { saveGeneratedVocabularyExamples } from '../../storage/vocabulary';
import { aiErrorText } from '../../utils/aiErrorText';
import type { VocabularyBookSource, VocabularyGenerated } from '../../types/vocabulary';
import { Button } from '../ui/button';

export function VocabularyExamples({ word, source }: { word: VocabularyJoined; source?: VocabularyBookSource }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const [busy, setBusy] = useState(false);
  // Both transient states carry the word they belong to, so a late reply never lands under a switched card
  // (the run's revealed card reuses this component across words; saves always land on their own row).
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  // The review card keeps its own row snapshot, so the answer generated here is held until the word changes.
  const [fresh, setFresh] = useState<{ key: string; generated: VocabularyGenerated } | null>(null);
  const saved = fresh?.key === word.key ? fresh.generated : word.row?.generated;
  const message = failure?.key === word.key ? failure.message : null;
  const definition = word.row?.contexts[0]?.definition;
  // The meaning the model is asked to write for: what this card itself shows as the word's gloss.
  const gloss = source
    ? source.senses.map((sense) => sense.gloss[language]).join(' ; ')
    : definition?.kind === 'imported'
      ? definition.back
      : definition?.kind === 'reader'
        ? definition.entry.gloss[language]
        : definition?.kind === 'ai'
          ? (language === 'en' && definition.analysis.translationEn) || definition.analysis.translation
          : undefined;
  const partOfSpeech =
    source?.senses.find((sense) => sense.pos)?.pos ??
    (definition?.kind === 'ai' && definition.analysis.partOfSpeech ? definition.analysis.partOfSpeech : undefined);
  const hasExample =
    !!saved ||
    !!source?.senses.some((sense) => sense.examples.length > 0) ||
    !!word.row?.contexts.some(
      (context) =>
        context.sentence !== '' ||
        (context.definition.kind === 'ai' && !!context.definition.analysis.usageExamples?.length),
    );
  const generate = async () => {
    if (busy || !gloss) return;
    const key = word.key;
    setBusy(true);
    setFailure(null);
    try {
      const answer = await generateWordExamples({ word: word.word, gloss, partOfSpeech });
      const generated = await saveGeneratedVocabularyExamples(key, answer);
      setFresh({ key, generated });
    } catch (err) {
      setFailure({ key, message: aiErrorText(err) });
    } finally {
      setBusy(false);
    }
  };
  if (saved)
    return (
      <section className="space-y-4 border-t border-ink-200 pt-6">
        <p className="text-xs text-ink-600">{t('gradedReader.ai.answer')}</p>
        {saved.examples.map((example, index) => (
          <div key={index} className="space-y-1">
            <p lang="fr" className="font-serif text-lg">
              {example.fr}
            </p>
            <p className="text-ink-600">{language === 'en' ? example.en : example.zh}</p>
          </div>
        ))}
        {saved.usage && <p className="text-ink-600">{saved.usage}</p>}
      </section>
    );
  if (!word.row || hasExample || !gloss || !getAiAccess().isConfigured('text')) return null;
  return (
    <div className="space-y-2 border-t border-ink-200 pt-4">
      <Button
        variant="ghost"
        className="min-h-10 whitespace-normal"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void generate()}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center" aria-hidden="true">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        </span>
        {t(busy ? 'vocab.generatingExamples' : 'vocab.generateExamples')}
      </Button>
      {message && (
        <p role="alert" className="break-words text-sm text-bad-700">
          {message}
        </p>
      )}
    </div>
  );
}
