/** Owns service access-key authentication; no key or Authorization header is logged or stored. */
export async function authorized(request: Request, accessKeys: string | undefined): Promise<boolean> {
  const keys = (accessKeys ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  const presented = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!presented || !keys.length) return false;

  const digests = await Promise.all(
    [presented, ...keys].map(
      async (key) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))),
    ),
  );
  // Compare every fixed-length digest, without a key-dependent early exit.
  const matched = digests.slice(1).reduce((matched, digest) => {
    let difference = 0;
    for (let i = 0; i < digest.length; i++) difference |= digest[i] ^ digests[0][i];
    return matched | Number(difference === 0);
  }, 0);
  return matched !== 0;
}
