/** Editable review of an in-memory import draft; selection is explicit and promotion belongs to prepareImport. */
import { useTranslation } from 'react-i18next';
import { answerKey, type ImportDraft } from '../../services/exercises/importDraft';
import { TextField, field } from './fields';
import { LEARNING_AREAS, type LearningArea, supportsListening } from '../../types/learningArea';
import { DraftItem } from './DraftItem';
export function DraftReview({
  draft,
  onChange,
  selected,
  onSelect,
  edited,
  onEditAnswer,
}: {
  draft: ImportDraft;
  onChange: (draft: ImportDraft) => void;
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  edited: Set<string>;
  onEditAnswer: (key: string) => void;
}) {
  const { t } = useTranslation();
  const editUnit = (index: number, update: Partial<ImportDraft['units'][number]>) =>
    onChange({ ...draft, units: draft.units.map((unit, i) => (i === index ? { ...unit, ...update } : unit)) });
  return (
    <section className="space-y-4 min-w-0" aria-label={t('importExercises.review')}>
      <h2 className="font-serif text-xl font-semibold">{t('importExercises.review')}</h2>
      <p className="text-sm text-ink-700">{t('importExercises.reviewHelp')}</p>
      <TextField
        label={t('importExercises.title')}
        value={draft.materialTitle ?? ''}
        onChange={(materialTitle) => onChange({ ...draft, materialTitle })}
      />
      {draft.warnings.map((warning, i) => (
        <p key={i} className="text-sm text-ink-700 break-words">
          {t('importExercises.warning', { msg: warning })}
        </p>
      ))}
      {draft.units.map((unit, ui) => (
        <section key={unit.id} className="border-t border-ink-200 pt-4 space-y-3 min-w-0">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={selected.has(unit.id)}
              onChange={(e) => onSelect(unit.id, e.target.checked)}
            />
            {t('importExercises.includeUnit', { title: unit.title })}
          </label>
          <label className="block text-sm">
            {t('learning.area')}
            <select
              className={field}
              required
              value={unit.learningArea}
              onChange={(event) => editUnit(ui, { learningArea: event.target.value as LearningArea })}
            >
              {LEARNING_AREAS.map((area) => (
                <option key={area} value={area}>
                  {t(`learning.areas.${area}`)}
                </option>
              ))}
            </select>
          </label>
          {unit.learningArea === 'listening' && !supportsListening(unit) && (
            <p role="alert" className="text-sm text-bad-700">
              {t('learning.unsupportedListening')}
            </p>
          )}
          <TextField
            label={t('importExercises.unitTitle')}
            value={unit.title}
            onChange={(title) => editUnit(ui, { title })}
          />
          <TextField
            label={t('importExercises.instruction')}
            multiline
            value={unit.instruction}
            onChange={(instruction) => editUnit(ui, { instruction })}
          />
          <TextField
            label={t('importExercises.passage')}
            multiline
            value={unit.readingPassage?.content ?? ''}
            onChange={(content) =>
              editUnit(ui, { readingPassage: content ? { ...unit.readingPassage, content } : undefined })
            }
          />
          {unit.items.map((item, ii) => (
            <DraftItem
              key={item.id}
              item={item}
              type={item.type ?? unit.type}
              edited={edited.has(answerKey(unit.id, item.id))}
              onRemove={() => editUnit(ui, { items: unit.items.filter((_, i) => i !== ii) })}
              onChange={(update, answerEdit) => {
                if (answerEdit) onEditAnswer(answerKey(unit.id, item.id));
                editUnit(ui, { items: unit.items.map((old, i) => (i === ii ? { ...old, ...update } : old)) });
              }}
            />
          ))}
        </section>
      ))}
    </section>
  );
}
