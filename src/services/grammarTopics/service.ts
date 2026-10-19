/** Owns credential-free content GETs and transport errors; validation and offline storage belong to loaders. */
export function contentServiceUrl(): string | undefined {
  return import.meta.env.VITE_CONTENT_SERVICE_URL?.replace(/\/$/, '') || undefined;
}

export class ContentServiceHttpError extends Error {
  constructor(
    public status: number,
    code: string,
  ) {
    super(`HTTP ${status}: ${code}`);
  }
}

export class ContentServiceNetworkError extends Error {}

export async function contentServiceFetch(path: string): Promise<unknown> {
  const url = contentServiceUrl();
  if (!url) throw new Error('Content service is not configured');
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, { credentials: 'omit' });
  } catch (error) {
    throw new ContentServiceNetworkError(error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    // The service answers its own errors as JSON; a platform page (a gateway or rate-limit error) is not JSON.
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new ContentServiceHttpError(response.status, body?.error ?? 'unexpected response');
  }
  return response.json();
}
