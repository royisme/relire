/** Generated units must still belong to the exact source content when their save commits. */
import { beforeEach, expect, test } from 'bun:test';
import { article, failure, freshDb, putArticle } from './fixtures/storage';
import { unitOf } from './fixtures/units';
import { db } from '../src/storage/db';
import { listUnits, saveUnits } from '../src/storage/exercises';

beforeEach(freshDb);

test('saveUnits accepts unchanged source content but atomically rejects an edited source', async () => {
  await putArticle();
  const source = article();
  const d = await db();
  await d.put('articles', { ...source, title: 'A new title' });
  const [saved] = await saveUnits(source.id, [unitOf('FILL_BLANKS')], source.content);
  await d.put('articles', { ...source, content: 'Un autre texte.' });
  const result = await failure(saveUnits(source.id, [{ ...unitOf('OPEN_QA'), id: 'late' }], source.content));
  expect(result).toBeInstanceOf(Error);
  expect(await listUnits(source.id)).toEqual([saved]);
});
