import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEPT_NOTES, LINES_MOST, NOTES_MOST, isNew, notesOf, readNotes } from './patchNotes.ts';

const note = (number: number, merged: string) => ({ number, title: `Update ${number}`, merged, lines: ['A line.'] });

test('notes are read newest first, each checked, and only so many', () => {
  const many = Array.from({ length: 20 }, (_unused, index) =>
    note(index, `2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`),
  );
  const read = notesOf({ notes: many });
  assert.equal(read?.length, NOTES_MOST);
  assert.equal(read?.[0]?.number, 19);
});

test('a note without its number, title, time or any line is dropped, and too many lines are cut', () => {
  const read = notesOf({
    notes: [
      { ...note(1, '2026-11-25T00:00:00Z'), lines: [] },
      { ...note(2, 'not a time') },
      { ...note(3, '2026-11-25T00:00:00Z'), title: '' },
      { ...note(4, '2026-11-25T00:00:00Z'), lines: Array.from({ length: 30 }, () => 'A line.') },
    ],
  });
  assert.deepEqual(
    read?.map((kept) => [kept.number, kept.lines.length]),
    [[4, LINES_MOST]],
  );
  assert.equal(notesOf({ notes: 'none' }), null);
  assert.equal(notesOf(null), null);
});

test('a note is new only when merged since the player last pressed Play; a first launch marks none', () => {
  const later = note(2, '2026-11-25T12:00:00Z');
  assert.equal(isNew(later, '2026-11-20T00:00:00Z'), true);
  assert.equal(isNew(later, '2026-11-26T00:00:00Z'), false);
  assert.equal(isNew(later, null), false);
});

/** A store as the browser's, for the tests. */
function storeOf(): Pick<Storage, 'getItem' | 'setItem'> & { readonly held: Map<string, string> } {
  const held = new Map<string, string>();
  return { held, getItem: (key) => held.get(key) ?? null, setItem: (key, value) => void held.set(key, value) };
}

test('the notes read are kept, and kept ones are shown when the site does not answer', async () => {
  const kept = storeOf();
  const answer = { notes: [note(7, '2026-11-25T12:00:00Z')] };
  const read = await readNotes('/play/', kept, async (address) => {
    assert.equal(address, '/play/patch-notes.json');
    return new Response(JSON.stringify(answer));
  });
  assert.deepEqual([read.from, read.notes.length], ['read', 1]);
  assert.ok(kept.held.has(KEPT_NOTES));
  const offline = await readNotes('/play/', kept, () => Promise.reject(new Error('offline')));
  assert.deepEqual([offline.from, offline.notes[0]?.number], ['kept', 7]);
  const missing = await readNotes('/play/', storeOf(), async () => new Response('', { status: 404 }));
  assert.deepEqual([missing.from, missing.notes], ['none', []]);
});
