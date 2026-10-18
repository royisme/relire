/**
 * The units of the open unit's batch, listed under Practice in the navigation
 * tree (the sidebar when expanded, and the phone drawer). Plain indented links;
 * the open unit is the current page. Draws nothing on the practice list itself.
 */
import { useUnitRows } from '../../hooks/useUnitRows';
import type { Route } from '../../utils/routes';
import { NavItem } from './NavItem';

export function PracticeSubnav({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  const { rows } = useUnitRows();
  const open = route.name === 'unit' ? rows.find(({ unit }) => unit.id === route.unitId) : undefined;
  return (
    <>
      {rows
        .filter(({ unit }) => unit.setId === open?.unit.setId)
        .map(({ unit }) => (
          <NavItem
            key={unit.id}
            to={{ name: 'unit', unitId: unit.id }}
            label={unit.title}
            current={route.name === 'unit' && route.unitId === unit.id ? 'page' : undefined}
            onNavigate={onNavigate}
          />
        ))}
    </>
  );
}
