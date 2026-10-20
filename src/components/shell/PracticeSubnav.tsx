/**
 * The open set and its exercises under Practice in the navigation tree
 * (expanded sidebar or phone drawer). Owns the current sub-page link;
 * draws nothing on the Practice list and does not navigate imperatively.
 */
import { useTranslation } from 'react-i18next';
import { setLabel, unitTitle } from '../../services/exercises/setLabel';
import { useUnitRows } from '../../hooks/useUnitRows';
import type { Route } from '../../utils/routes';
import { NavItem } from './NavItem';

export function PracticeSubnav({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  const { t, i18n } = useTranslation();
  const { rows } = useUnitRows();
  const open = rows.find(({ unit }) =>
    route.name === 'unit' ? unit.id === route.unitId : route.name === 'practiceSet' && unit.setId === route.setId,
  );
  return (
    <>
      {open && (
        <NavItem
          to={{ name: 'practiceSet', setId: open.unit.setId }}
          label={setLabel(t, open.unit, i18n.resolvedLanguage)}
          current={route.name === 'practiceSet' ? 'page' : undefined}
          onNavigate={onNavigate}
        />
      )}
      {rows
        .filter(({ unit }) => unit.setId === open?.unit.setId)
        .map(({ unit }) => (
          <NavItem
            key={unit.id}
            to={{ name: 'unit', unitId: unit.id }}
            label={unitTitle(unit, i18n.resolvedLanguage)}
            current={route.name === 'unit' && route.unitId === unit.id ? 'page' : undefined}
            onNavigate={onNavigate}
          />
        ))}
    </>
  );
}
