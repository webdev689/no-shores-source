import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS } from '../../network/gearMessages.ts';
import { item, state } from '../../network/gearForTests.ts';
import { letterRows } from './mailPage.ts';

test('each letter is offered to take by its number, named by what it holds, and Take all while any waits', () => {
  const vestige = { id: 4, rarity: 2, slot: 2, level: 12, vaulted: false };
  const mail = [
    { id: 31, words: 'Left lying.', vestige, item: null },
    { id: 32, words: 'Salvage.', vestige: null, item: item({ id: 0, rarity: 3, kind: 25, bucket: 8 }) },
    { id: 33, words: 'A notice.', vestige: null, item: null },
  ];
  const { rows, takeAll } = letterRows(state({ mail }));
  assert.deepEqual(
    rows.map((row) => row.take),
    [31, 32, 33].map((letter) => ({ kind: ASKS.takeLetter, item: letter })),
  );
  assert.deepEqual(
    rows.map((row) => row.rarity),
    [2, 3, null],
  );
  assert.equal(rows[0]?.holds, 'Rare Vestige');
  assert.ok(rows[1]?.holds, 'an item by its own name');
  assert.equal(rows[2]?.holds, '', 'a letter holding nothing names nothing');
  assert.deepEqual(takeAll, { kind: ASKS.takeAllLetters });
  assert.deepEqual(letterRows(state({})), { rows: [], takeAll: null }, 'nothing to take from an empty mailbox');
});
