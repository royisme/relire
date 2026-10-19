/** Owns the shared external-reference path guard; never defaults to a local dataset. */
import { realpath, stat } from 'node:fs/promises';
import { relative, isAbsolute, join } from 'node:path';

export const repositoryRoot = new URL('../../', import.meta.url).pathname;

export async function referenceDirectory(input: string | undefined, root = repositoryRoot): Promise<string> {
  if (!input) throw new Error('Set GRAMMAR_REFERENCE_DIR or pass --reference <directory>');
  const directory = await realpath(input);
  const within = relative(await realpath(root), directory);
  if (!within || (!within.startsWith('..' + '/') && within !== '..' && !isAbsolute(within)))
    throw new Error('The reference directory must be outside the repository');
  if (!(await stat(join(directory, 'topics')).catch(() => null))?.isDirectory())
    throw new Error('The reference directory needs topics/');
  if (!(await stat(join(directory, 'library.sqlite3')).catch(() => null))?.isFile())
    throw new Error('The reference directory needs library.sqlite3');
  return directory;
}
