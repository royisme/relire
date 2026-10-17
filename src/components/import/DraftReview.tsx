/** Editable review of an in-memory import draft; selection is explicit and promotion belongs to prepareImport. */
import { useTranslation } from 'react-i18next';
import { answerKey, type ImportDraft } from '../../services/exercises/importDraft';
import { TextField } from './fields';
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
    <section className="space-y-4 min-w-0" aria-label={t('importFlow.review')}>
      <h2 className="font-serif text-xl font-semibold">{t('importFlow.review')}</h2>
      <p className="text-sm text-ink-700">{t('importFlow.reviewHelp')}</p>
      <TextField
        label={t('importFlow.title')}
        value={draft.materialTitle ?? ''}
        onChange={(materialTitle) => onChange({ ...draft, materialTitle })}
      />
      <TextField
        label={t('importFlow.sourceText')}
        multiline
        maxLength={80000}
        value={draft.sourceText}
        onChange={(sourceText) => onChange({ ...draft, sourceText })}
      />
      {draft.warnings.map((warning, i) => (
        <p key={i} className="text-sm text-ink-700 break-words">
          {t('importFlow.warning', { msg: warning })}
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
            {t('importFlow.includeUnit', { title: unit.title })}
          </label>
          <TextField
            label={t('importFlow.unitTitle')}
            value={unit.title}
            onChange={(title) => editUnit(ui, { title })}
          />
          <TextField
            label={t('importFlow.instruction')}
            multiline
            value={unit.instruction}
            onChange={(instruction) => editUnit(ui, { instruction })}
          />
          <TextField
            label={t('importFlow.passage')}
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
