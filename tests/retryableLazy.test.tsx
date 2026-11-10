/** Uses server streaming to test lazy loader retries, not browser chunk transport or client recovery. */
import { expect, mock, test } from 'bun:test';
import { renderToReadableStream } from 'react-dom/server';
import { retryableLazy, retryFailedLazyImports } from '../src/utils/retryableLazy';

const onError = () => {};

function Loaded({ label }: { label: string }) {
  return <p>{label}</p>;
}

test('explicit retry replaces a cached rejection and calls the loader again', async () => {
  const error = new Error('Chunk unavailable');
  const load = mock(() => Promise.resolve({ default: Loaded }));
  load.mockRejectedValueOnce(error);
  const LazyPage = retryableLazy(load);

  for (let render = 0; render < 2; render++) {
    const failure = await renderToReadableStream(<LazyPage label="Ready" />, { onError }).catch(
      (caught: unknown) => caught,
    );
    expect(failure).toBe(error);
  }
  expect(load).toHaveBeenCalledTimes(1);

  retryFailedLazyImports();
  const stream = await renderToReadableStream(<LazyPage label="Ready" />, { onError });
  expect(await new Response(stream).text()).toBe('<p>Ready</p>');
  expect(load).toHaveBeenCalledTimes(2);
});

test('retry leaves successfully loaded lazy instances cached', async () => {
  const load = mock(() => Promise.resolve({ default: Loaded }));
  const LazyPage = retryableLazy(load);
  await renderToReadableStream(<LazyPage label="First" />, { onError });
  retryFailedLazyImports();
  const stream = await renderToReadableStream(<LazyPage label="Second" />, { onError });
  expect(await new Response(stream).text()).toBe('<p>Second</p>');
  expect(load).toHaveBeenCalledTimes(1);
});

test('retry leaves pending imports alone and repeated failures remain retryable', async () => {
  const pending = Promise.withResolvers<{ default: typeof Loaded }>();
  const loadPending = mock(() => pending.promise);
  const PendingPage = retryableLazy(loadPending);
  const rendering = renderToReadableStream(<PendingPage label="Pending resolved" />, { onError });
  const loadFailed = mock(() => Promise.reject(new Error('Still offline')));
  const FailedPage = retryableLazy(loadFailed);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const failure = await renderToReadableStream(<FailedPage />, { onError }).catch((caught: unknown) => caught);
    expect(failure).toEqual(new Error('Still offline'));
    expect(loadFailed).toHaveBeenCalledTimes(attempt);
    retryFailedLazyImports();
  }
  pending.resolve({ default: Loaded });
  expect(await new Response(await rendering).text()).toBe('<p>Pending resolved</p>');
  expect(loadPending).toHaveBeenCalledTimes(1);
});
