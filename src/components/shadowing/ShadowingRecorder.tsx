import React from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, Loader2, Mic, Square } from 'lucide-react';
import { PronunciationAssessment } from '../../types';
import { useShadowingRecorder } from '../../hooks/useShadowingRecorder';
import { Button } from '../ui/button';
import { AssessmentResult } from './AssessmentResult';

/**
 * Record yourself reading a sentence, listen back, and get it scored. One control row, a player
 * that appears once there is a recording, then the result; each part wraps on narrow screens.
 */

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Props {
  referenceText: string;
  onAssessed?: (assessment: PronunciationAssessment, sentence: string) => void;
}

export const ShadowingRecorder: React.FC<Props> = ({ referenceText, onAssessed }) => {
  const { t } = useTranslation();
  const r = useShadowingRecorder(referenceText, onAssessed);
  const hasRecording = r.phase === 'recorded';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.phase === 'recording' ? (
          <Button variant="destructive" onClick={r.stop}>
            <Square className="w-4 h-4 fill-current" aria-hidden="true" />
            <span>{t('shadowing.stop')}</span>
            <span className="tnum" aria-hidden="true">{clock(r.seconds)}</span>
          </Button>
        ) : (
          <Button variant={hasRecording ? 'outline' : 'default'} onClick={r.start}>
            <Mic className="w-4 h-4" aria-hidden="true" />
            <span>{hasRecording ? t('shadowing.recordAgain') : t('shadowing.record')}</span>
          </Button>
        )}

        {hasRecording && (
          <Button onClick={r.assess} disabled={r.isEvaluating}>
            {r.isEvaluating ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <AudioLines className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{r.isEvaluating ? t('shadowing.checking') : t('shadowing.check')}</span>
          </Button>
        )}
      </div>

      {hasRecording && r.audioUrl && (
        <audio controls src={r.audioUrl} aria-label={t('shadowing.yourRecording')} className="w-full max-w-md h-10" />
      )}

      {r.error && (
        <p role="alert" className="text-sm text-bad-700 break-words">
          {r.error.kind === 'mic' ? t('shadowing.micError') : `${t('shadowing.assessError')} ${r.error.detail}`}
        </p>
      )}

      {r.assessment && <AssessmentResult assessment={r.assessment} />}
    </div>
  );
};
