/** Azure region syntax shared by storage, Settings and execution; never substitutes a region. */
export function normalizeAzureRegion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const region = value.trim();
  return /^[a-zA-Z0-9-]+$/.test(region) ? region : undefined;
}
