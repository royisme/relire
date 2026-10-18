/**
 * NUMBER_DICTATION: one Listen button that plays the item's `audioText`
 * through `utils/speech` — the clip is stored like every other, so a number is
 * synthesized once — at the learner's dictation speed, and one typed line for
 * what was heard. With "Speak after checking" on, the item is spoken again
 * once its check lands (not on every reload of an already-checked one): with
 * the selected engine once the Practice opt-in allows remote synthesis, and
 * with the device's voice otherwise.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { expectedAnswerText } from '../../../services/exercises/answer';
import { getAppSettings, speechAfterCheck } from '../../../utils/appSettings';
import { speakFrench } from '../../../utils/speech';
import { SpeakButton } from '../../ui/speak-button';
import { ExpectedBeside, UnderlineInput } from './UnderlineInput';
import type { ExerciseControlProps } from './types';
import { InlineMarkup } from '../InlineMarkup';

export function NumberDictationControl({
  item,
  onWord,
  answer,
  onChange,
  checked,
  disabled,
  registerInput,
}: ExerciseControlProps) {
  const { t } = useTranslation();
  // A dictation item that reached the sheet without its own text to read: speak the reference.
  const audio = item.audioText?.trim() || expectedAnswerText(item);
  const wasChecked = useRef(Boolean(checked));

  useEffect(() => {
    if (!checked) {
      wasChecked.current = false;
      return;
    }
    if (wasChecked.current) return;
    wasChecked.current = true;
    const settings = getAppSettings();
    const source = speechAfterCheck(settings);
    if (!source) return;
    // Without the remote opt-in the replay uses the device voice: it costs nothing and synthesizes nothing.
    void speakFrench(audio, {
      rate: settings.practiceDictationSpeed,
      ...(source === 'device' ? { engine: 'device' as const } : {}),
    });
  }, [checked, audio]);

  return (
    <div className="space-y-2">
      <p className="break-words font-serif text-lg text-ink-900">
        <InlineMarkup text={item.prompt} onWord={onWord} />
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <SpeakButton
          text={audio}
          rate={getAppSettings().practiceDictationSpeed}
          label={t('practice.listen')}
          stopLabel={t('reader.stop')}
          variant="outline"
          showLabel
        />
        <UnderlineInput
          value={answer.singleAnswer}
          onChange={(value) => onChange({ ...answer, singleAnswer: value })}
          slot={0}
          registerInput={registerInput}
          label={t('practice.answerLabel', { number: item.itemNumber })}
          state={!checked ? 'open' : checked.correct ? 'right' : 'wrong'}
          readOnly={disabled}
          className="w-60 max-w-full"
          align="left"
        />
        {checked && !checked.correct && <ExpectedBeside text={expectedAnswerText(item)} />}
      </div>
    </div>
  );
}
