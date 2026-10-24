/**
 * The optional explicit Ask AI of the authored graded-reader sheets: invisible without a configured text
 * AI, never automatic. Owns only its own request states inside a fixed-height reserved region; the answer
 * is drawn in a separately labelled block under the authored content. No vocabulary, progress or stats
 * write, and no automatic Settings navigation — a missing key found after a tap shows an explicit link.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { fetchWordAnalysis, fetchSentenceAnalysis } from '../../services/api';
import { getAiAccess } from '../../services/ai/access';
import { MissingApiKeyError, errorMessage } from '../../services/ai/errors';
import type { SentenceAnalysis, WordAnalysis } from '../../types';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';

export type AuthoredAskAiSubject =
  | { kind: 'word'; word: string; sentence: string; text: string }
  | { kind: 'sentence'; sentence: string; text: string };

export function AuthoredAskAi({ subject }: { subject: AuthoredAskAiSubject }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<WordAnalysis | SentenceAnalysis | null>(null);
  const [failure, setFailure] = useState<{ message: string; missingKey: boolean } | null>(null);
  // A newer request, a switched word/sentence or a closed sheet must not land a late answer.
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  if (!getAiAccess().isConfigured('text')) return null;

  const ask = async () => {
    const token = ++request.current;
    setBusy(true);
    setAnswer(null);
    setFailure(null);
    try {
      const result =
        subject.kind === 'word'
          ? await fetchWordAnalysis(subject.word, subject.sentence, subject.text)
          : await fetchSentenceAnalysis(subject.sentence, subject.text);
      if (token !== request.current) return;
      setAnswer(result);
    } catch (err) {
      if (token !== request.current) return;
      setFailure({ message: errorMessage(err), missingKey: err instanceof MissingApiKeyError });
    } finally {
      if (token === request.current) setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-ink-200 pt-3">
      <Button
        variant="outline"
        className="min-h-10 whitespace-normal"
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          void ask();
        }}
      >
        <span className="h-4 w-4">{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}</span>
        {t(subject.kind === 'word' ? 'gradedReader.ai.askWord' : 'gradedReader.ai.askSentence')}
      </Button>
      {/* Fixed height in every state, so the answer or error never moves the authored content above it. */}
      <div role="status" className="h-44 overflow-y-auto text-sm">
        {failure ? (
          <div className="space-y-1">
            <p role="alert" className="break-words text-bad-700">
              {failure.message}
            </p>
            {failure.missingKey && (
              <Link
                className="underline text-accent-900"
                to={{
                  name: 'settings',
                  section: 'ai',
                  purpose: 'text',
                  focusKey: true,
                  returnTo: window.location.hash || '#/read',
                }}
              >
                {t('nav.settings')}
              </Link>
            )}
          </div>
        ) : answer ? (
          // The AI answer: drawn apart from the authored text, under its own honesty label.
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-500">{t('gradedReader.ai.answer')}</p>
            {'word' in answer ? (
              <div className="space-y-2">
                <p className="text-base text-ink-900 break-words">
                  {isEn && answer.translationEn ? answer.translationEn : answer.translation}
                </p>
                {answer.otherMeanings && answer.otherMeanings.length > 0 && (
                  <p className="text-sm text-ink-600 break-words">
                    {answer.otherMeanings.join(t('common.listSeparator'))}
                  </p>
                )}
                {answer.contextTense && <p className="text-sm text-ink-700 break-words">{answer.contextTense}</p>}
                {answer.usageExamples?.map((example, index) => (
                  <div key={index} className="space-y-0.5">
                    <p className="font-serif text-sm text-ink-900 break-words">{example.fr}</p>
                    <p className="text-sm text-ink-600 break-words">{isEn && example.en ? example.en : example.zh}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {answer.syntaxStructure.map((segment, index) => (
                  <div key={index} className="space-y-0.5">
                    <p className="break-words">
                      <span className="font-serif text-base text-ink-900">{segment.segment}</span>{' '}
                      <span className="text-xs text-ink-500">{segment.role}</span>
                    </p>
                    <p className="text-sm text-ink-700 break-words">{segment.explanation}</p>
                  </div>
                ))}
                {answer.grammarPoints.map((point, index) => (
                  <div key={index} className="space-y-0.5">
                    <p className="text-sm font-medium text-ink-900 break-words">{point.title}</p>
                    <p className="text-sm text-ink-700 break-words">{point.explanation}</p>
                    {point.ruleFormula && (
                      <p className="font-mono text-xs text-ink-900 break-words">{point.ruleFormula}</p>
                    )}
                  </div>
                ))}
                {answer.patternCollocations.map((pattern, index) => (
                  <div key={index} className="space-y-0.5">
                    <p className="break-words">
                      <span className="font-serif text-base font-medium text-ink-900">{pattern.pattern}</span>{' '}
                      <span className="text-sm text-ink-600">{pattern.meaning}</span>
                    </p>
                    {pattern.examples.map((example, exampleIndex) => (
                      <p key={exampleIndex} className="text-sm text-ink-700 break-words">
                        {example.fr}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
