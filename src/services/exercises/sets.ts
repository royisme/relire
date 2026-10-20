/** Owns pure set aggregation and title/level filtering; storage and table sorting stay with callers. */
import type { TFunction } from 'i18next';
import type { UnitRow } from '../../hooks/useUnitRows';
import { setLabel } from './setLabel';

export function aggregateSets(rows: UnitRow[], t: TFunction, language?: string) {
  const groups = new Map<string, UnitRow[]>();
  for (const row of rows) {
    const group = groups.get(row.unit.setId);
    if (group) group.push(row);
    else groups.set(row.unit.setId, [row]);
  }
  return [...groups.entries()].map(([setId, group]) => ({
    setId,
    title: setLabel(t, group[0].unit, language),
    exerciseRevision: group[0].unit.topicOrigin?.exerciseRevision,
    level: group[0].unit.level,
    createdAt: group[0].unit.createdAt,
    types: [...new Set(group.map(({ unit }) => unit.type))],
    rows: group,
    progress: group.reduce(
      (sum, { progress }) => ({
        checked: sum.checked + progress.checked,
        total: sum.total + progress.total,
        correct: sum.correct + progress.correct,
      }),
      { checked: 0, total: 0, correct: 0 },
    ),
  }));
}

export type SetRow = ReturnType<typeof aggregateSets>[number];

export function filterSets(sets: SetRow[], query: string, level: string) {
  const q = query.trim().toLowerCase();
  return sets.filter((set) => (level === 'all' || set.level === level) && set.title.toLowerCase().includes(q));
}
