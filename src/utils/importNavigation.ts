/** Import-only leave protection over the existing hash router. Owns pending leave decisions and route publication; index.html owns position recording. */
declare global {
  interface Window {
    relireHistory: { read(): number; replace(href?: string): void; push(href: string): void };
  }
}
const recorder = window.relireHistory;
export const ROUTE_CHANGED = 'relire-route';
type Intent = { href: string; replace: boolean } | { delta: number };
type Guard = (decide: (discard: boolean) => void) => void;
let guard: Guard | null = null;
let allowDestination: ((href: string) => boolean) | undefined;
let published = window.location.hash;
let position = recorder.read();
let restoring = false;
let pending: Intent | null = null;
let asking = false;
let replaying = false;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

const emit = () => window.dispatchEvent(new Event(ROUTE_CHANGED));
function publish() {
  position = recorder.read();
  published = window.location.hash;
  emit();
}
function ask() {
  if (!pending || asking || restoring || !guard) return;
  asking = true;
  guard((discard) => {
    const intent = pending;
    asking = false;
    pending = null;
    if (!discard || !intent) return;
    guard = null;
    if ('delta' in intent) {
      replaying = true;
      window.history.go(intent.delta);
    } else move(intent.href, intent.replace);
  });
}
function onBrowserNavigation() {
  const target = recorder.read();
  if (restoring) {
    if (target === position && window.location.hash === published) {
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      restoreTimer = null;
      restoring = false;
      ask();
    } else restoreOrigin();
    return;
  }
  if (target === position && window.location.hash === published) return; // paired hashchange
  if (replaying || !guard || allowDestination?.(window.location.hash)) {
    replaying = false;
    publish();
    return;
  }
  const delta = target - position;
  if (!delta) return;
  pending ??= { delta };
  restoring = true; // set before go: popstate and hashchange must schedule only one restoration
  restoreOrigin();
}
/** Coalesce paired events and queued rapid traversals before computing one restoration from the live position. */
function restoreOrigin() {
  if (restoreTimer !== null) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    const actual = recorder.read();
    if (actual !== position) window.history.go(position - actual);
  }, 0);
}
window.addEventListener('popstate', onBrowserNavigation);
window.addEventListener('hashchange', onBrowserNavigation);

function move(href: string, replace: boolean) {
  if (replace) recorder.replace(href);
  else {
    recorder.push(href);
    window.scrollTo(0, 0);
  }
  publish();
}
export function importAwareNavigate(href: string, replace = false) {
  if (href === published || restoring || replaying) return;
  if (guard && !allowDestination?.(href)) {
    pending ??= { href, replace };
    ask();
  } else move(href, replace);
}
export const publishedHash = () => published;
/** One mounted import page owns this callback. Release explicitly before successful-save navigation. */
export function protectImport(next: Guard, allow?: (href: string) => boolean): () => void {
  guard = next;
  allowDestination = allow;
  return () => {
    if (guard === next) {
      guard = null;
      allowDestination = undefined;
      pending = null;
      asking = false;
    }
  };
}
