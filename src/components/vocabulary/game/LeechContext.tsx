import { useTranslation } from 'react-i18next';
import type { contextOf } from '../../../services/vocabulary/game/collection';

/** Shared read-only context on the map and the revealed boss card. */
export function LeechContext({ context }: { context: ReturnType<typeof contextOf> & { lapses: number } }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 break-words border-t border-ink-200 pt-4">
      <h3 className="text-sm font-semibold">{t('vocab.map.leech')}</h3>
      <p className="tnum text-xs text-ink-600">{t('vocab.map.lapses', { lapses: context.lapses })}</p>
      {context.memoryTricks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-ink-600">{t('vocab.map.memoryTrick')}</p>
          {context.memoryTricks.map((trick) => (
            <p key={trick} className="text-sm">
              {trick}
            </p>
          ))}
        </div>
      )}
      {context.examples.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-ink-600">{t('vocab.map.examples')}</p>
          {context.examples.map((example) => (
            <p key={example} lang="fr" className="font-serif text-lg">
              {example}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
