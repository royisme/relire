/**
 * The units of the article being practised, listed under Practice in the
 * navigation tree (the sidebar when expanded, and the phone drawer). Plain
 * indented links; the open unit is the current page. Draws nothing until the
 * article has units.
 */
import { useRouteUnits } from '../../hooks/useMaterialUnits';
import type { Route } from '../../utils/routes';
import { NavItem } from './NavItem';

export function PracticeSubnav({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  const { rows } = useRouteUnits(route);
  return (
    <>
      {rows.map(({ unit }) => (
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
