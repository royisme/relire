/** Exercises boundary render/state methods without claiming that server rendering catches child errors. */
import { expect, spyOn, test } from 'bun:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { PageContentBoundary } from '../src/components/shell/PageContentBoundary';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } }, initAsync: false });
const render = (boundary: PageContentBoundary) =>
  renderToStaticMarkup(<I18nextProvider i18n={i18n}>{boundary.render()}</I18nextProvider>);

function failedBoundary() {
  const boundary = new PageContentBoundary({ routeKey: '#/read', children: <p>Page content</p> });
  const error = new Error('Chunk download interrupted');
  function ThrowingChild(): never {
    throw error;
  }
  // SSR does not run error boundaries, so exercise React's error-state entry point explicitly.
  try {
    renderToStaticMarkup(<ThrowingChild />);
  } catch (caught) {
    boundary.state = { ...boundary.state, ...PageContentBoundary.getDerivedStateFromError(caught) };
  }
  return { boundary, error };
}

test('the boundary renders children inside main when nothing throws', () => {
  const html = renderToStaticMarkup(
    <PageContentBoundary routeKey="#/read">
      <p>Page content</p>
    </PageContentBoundary>,
  );
  expect(html).toContain('<main class="flex-1 pb-16"><p>Page content</p></main>');
  expect(html).not.toContain('role="alert"');
});

test('a thrown child yields the real error and retry button in both locales', async () => {
  const { boundary } = failedBoundary();
  for (const [language, locale] of [
    ['en', en],
    ['zh', zh],
  ] as const) {
    await i18n.changeLanguage(language);
    const html = render(boundary);
    expect(html).toContain('Chunk download interrupted');
    expect(html).toContain(locale.pageFailure.message.replace('{{msg}}', 'Chunk download interrupted'));
    expect(html).toContain(`<button`);
    expect(html).toContain(`>${locale.pageFailure.retry}</button>`);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Page content');
  }
  await i18n.changeLanguage('en');
});

test('the fallback retry callback requests cleared state and renders the children again', () => {
  const { boundary } = failedBoundary();
  const setState = spyOn(boundary, 'setState').mockImplementation((update) => {
    if (typeof update === 'function') throw new Error('Expected a state reset');
    boundary.state = { ...boundary.state, ...update };
  });
  const fallback = boundary.render().props.children as ReactElement<{ onRetry: () => void }>;
  fallback.props.onRetry();
  expect(setState).toHaveBeenCalledWith({ error: null });
  expect(boundary.state.error).toBeNull();
  expect(render(boundary)).toContain('Page content');
});

test('route changes clear failures without replacing healthy children', () => {
  const { boundary } = failedBoundary();
  expect(PageContentBoundary.getDerivedStateFromProps(boundary.props, boundary.state)).toBeNull();
  const nextProps = { ...boundary.props, routeKey: '#/settings' };
  boundary.state = { ...boundary.state, ...PageContentBoundary.getDerivedStateFromProps(nextProps, boundary.state) };
  expect(boundary.state).toEqual({ routeKey: '#/settings', error: null });
  expect(boundary.render().props.children).toBe(boundary.props.children);
  expect(PageContentBoundary.getDerivedStateFromProps(nextProps, boundary.state)).toBeNull();
});

test('caught failures log the original error and component stack', () => {
  const { boundary, error } = failedBoundary();
  const info = { componentStack: 'ThrowingChild' };
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    boundary.componentDidCatch(error, info);
    expect(log).toHaveBeenCalledWith('Page rendering failed', error, info);
  } finally {
    log.mockRestore();
  }
});
