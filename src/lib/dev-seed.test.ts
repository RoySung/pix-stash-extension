import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { getDb } from './db';
import { clearDevLibrary, seedDevLibrary } from './dev-seed';

it('adds mock items alongside existing saves without duplicating or overwriting them', async () => {
  const db = await getDb();
  await seedDevLibrary();
  const fixture = (await db.getAll('items'))[0];
  await db.clear('items');
  const existing = { ...fixture, id: 'real-save', notes: 'keep me' };
  await db.put('items', existing);
  await seedDevLibrary();
  expect(await db.count('items')).toBe(19);
  expect(await db.get('items', 'real-save')).toEqual(existing);
  await db.put('items', { ...fixture, notes: 'edited mock' });
  await seedDevLibrary();
  expect(await db.count('items')).toBe(19);
  expect((await db.get('items', fixture.id))?.notes).toBe('edited mock');
});

it('removes preview fixtures while preserving real saves and collections', async () => {
  const db = await getDb();
  await seedDevLibrary();
  const fixture = (await db.getAll('items')).find(item => item.id === 'mock-item-0')!;
  await db.put('items', { ...fixture, id: 'real-save', metadata: {}, notes: 'keep me' });
  await db.put('collections', { id: 'real-collection', name: 'Mine', createdAt: new Date().toISOString() });
  await clearDevLibrary();
  expect((await db.getAll('items')).map(item => item.id)).toEqual(['real-save']);
  expect((await db.getAll('collections')).map(collection => collection.id)).toEqual(['real-collection']);
  await seedDevLibrary();
  expect(await db.count('items')).toBe(19);
});
