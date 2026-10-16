/**
 * Class names for the reader's ink panel (sentence bar, practice card, article player): the docked
 * tools read as tools, not page. Pass them to `Button` as className; tailwind-merge replaces the
 * variant's page colours.
 */
export const panelSurface =
  'panel pointer-events-auto rounded-lg border border-panel-line bg-panel text-panel-ink shadow-lg';
/** Icon and text buttons on the panel (use with variant="ghost"). */
export const panelGhost = 'text-panel-ink hover:bg-panel-raised hover:text-panel-ink';
/** Secondary buttons with a visible edge (use with variant="outline"). */
export const panelOutline = 'border-panel-line bg-transparent text-panel-ink hover:bg-panel-raised';
/** The one filled action on the panel. */
export const panelPrimary = 'bg-panel-accent text-on-fill hover:bg-panel-accent/90';
export const panelDanger = 'bg-panel-bad text-on-fill hover:bg-panel-bad/90';
