/** Collapsed question review and answer-shape conversion; no grading or persistence. */
import { useTranslation } from 'react-i18next';
import { ExerciseTypeSchema, type ExerciseType } from '../../types/exercises';
import { GrammarTagSchema } from '../../types/grammar';
import { answerOrigin, type ImportDraft } from '../../services/exercises/importDraft';
import { TextField, field } from './fields';
import { Button } from '../ui/button';
type Item = ImportDraft['units'][number]['items'][number];
function arrayAnswer(prompt: string, type: ExerciseType) {
  return (
    type === 'DIALOGUE_ORDER' ||
    (type === 'CHOICE_SELECT'
      ? [...prompt.matchAll(/\{[^}]+\}/g)].length > 1
      : ['FILL_BLANKS', 'READING_CLOZE'].includes(type) && (prompt.match(/\[___\]/g) || []).length > 1)
  );
}
function convert(answer: Item['expectedAnswer'], prompt: string, type: ExerciseType) {
  if (answer === null) return null;
  return arrayAnswer(prompt, type)
    ? Array.isArray(answer)
      ? answer
      : answer.split('\n')
    : Array.isArray(answer)
      ? answer.join('\n')
      : answer;
}
export function DraftItem({
  item,
  type,
  edited,
  onChange,
  onRemove,
}: {
  item: Item;
  type: ExerciseType;
  edited: boolean;
  onChange: (update: Partial<Item>, answerEdit?: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const answer = Array.isArray(item.expectedAnswer) ? item.expectedAnswer.join('\n') : (item.expectedAnswer ?? '');
  return (
    <div className="border-t border-ink-200 py-3 min-w-0">
      <div className="flex items-start gap-2">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer py-2 break-words">
            <span className="text-xs text-ink-600">
              {t(`exerciseTypes.${type}.name`)} · {t(`importExercises.origin.${answerOrigin(item, edited)}`)}
            </span>
            <span className="block font-serif">{item.prompt}</span>
            <span className="block text-sm text-ink-700">{answer || t('importExercises.noAnswer')}</span>
            {item.blockers.length > 0 && <span className="block text-sm text-bad-700">{item.blockers.join('; ')}</span>}
          </summary>
          <div className="space-y-3 py-3">
            <label className="block text-sm">
              {t('importExercises.type')}
              <select
                aria-label={t('importExercises.type')}
                className={field}
                value={type}
                onChange={(e) => {
                  const next = ExerciseTypeSchema.parse(e.target.value);
                  onChange({ type: next, expectedAnswer: convert(item.expectedAnswer, item.prompt, next) }, true);
                }}
              >
                {ExerciseTypeSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {t(`exerciseTypes.${value}.name`)}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label={t('importExercises.prompt')}
              multiline
              value={item.prompt}
              onChange={(prompt) => {
                const expectedAnswer = convert(item.expectedAnswer, prompt, type);
                onChange(
                  { prompt, expectedAnswer },
                  JSON.stringify(expectedAnswer) !== JSON.stringify(item.expectedAnswer),
                );
              }}
            />
            <TextField
              label={t('importExercises.options')}
              multiline
              value={(item.options ?? []).join('\n')}
              onChange={(value) => onChange({ options: value ? value.split('\n') : undefined })}
            />
            <TextField
              label={t(arrayAnswer(item.prompt, type) ? 'importExercises.answers' : 'importExercises.answer')}
              multiline
              value={answer}
              onChange={(value) =>
                onChange({ expectedAnswer: value.trim() ? convert(value, item.prompt, type) : null }, true)
              }
            />
            <TextField
              label={t('importExercises.alternatives')}
              multiline
              value={(item.acceptableAnswers ?? []).join('\n')}
              onChange={(value) => onChange({ acceptableAnswers: value ? value.split('\n') : undefined }, true)}
            />
            <label className="block text-sm">
              {t('importExercises.grammar')}
              <select
                aria-label={t('importExercises.grammar')}
                className={field}
                value={item.grammarTag}
                onChange={(e) => onChange({ grammarTag: GrammarTagSchema.parse(e.target.value) })}
              >
                {GrammarTagSchema.options.map((tag) => (
                  <option key={tag} value={tag}>
                    {t(`grammarTags.${tag}`)}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label={t('importExercises.secondaryPrompt')}
              multiline
              value={item.secondaryPrompt ?? ''}
              onChange={(secondaryPrompt) => onChange({ secondaryPrompt })}
            />
            <TextField
              label={t('importExercises.audioText')}
              multiline
              value={item.audioText ?? ''}
              onChange={(audioText) => onChange({ audioText })}
            />
            {item.blockers.length > 0 && (
              <label className="flex gap-2 text-sm">
                <input type="checkbox" onChange={() => onChange({ blockers: [] })} />
                {t('importExercises.resolved')}
              </label>
            )}
          </div>
        </details>
        <Button variant="ghost" onClick={onRemove}>
          {t('importExercises.excludeItem')}
        </Button>
      </div>
    </div>
  );
}
