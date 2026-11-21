import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ASKS } from '../../network/gearMessages.ts';
import { item, state } from '../../network/gearForTests.ts';
import { FROM_WORDS, letterRows, letterWords } from './mailPage.ts';

test('each letter is offered to take by its number, named by what it holds, and Take all while any waits', () => {
  const vestige = { id: 4, rarity: 2, slot: 2, level: 12, vaulted: false };
  const mail = [
    { id: 31, from: 0, crowded: false, vestige, item: null },
    { id: 32, from: 4, crowded: true, vestige: null, item: item({ id: 0, rarity: 3, kind: 25, bucket: 8 }) },
    { id: 33, from: 9, crowded: false, vestige: null, item: null },
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
  assert.deepEqual(
    rows.map((row) => row.words),
    mail.map(letterWords),
    'each row says its letter’s words',
  );
  assert.deepEqual(letterRows(state({})), { rows: [], takeAll: null }, 'nothing to take from an empty mailbox');
});

test('each source says its own words, a source a later room adds its own, and a crowded letter says more', () => {
  const words = (from: number, crowded = false) => letterWords({ id: 1, from, crowded, vestige: null, item: null });
  const known = Object.keys(FROM_WORDS).map((_name, from) => words(from));
  const later = words(known.length);
  assert.ok(
    [...known, later].every((said) => said.trim() !== ''),
    'none says nothing',
  );
  assert.equal(new Set([...known, later]).size, known.length + 1, 'no two say the same');
  for (const from of [0, known.length]) {
    const crowded = words(from, true);
    assert.ok(crowded.includes(words(from)) && crowded.length > words(from).length, 'a crowded letter says more');
  }
});

test('the page words each source by the number the gear crate gives it', async () => {
  const mail = await readFile(new URL('../../../../crates/gear/src/mail.rs', import.meta.url), 'utf8');
  const source = /pub enum Source \{([^}]*)\}/.exec(mail)?.[1] ?? '';
  const numbered = [...source.matchAll(/(\w+) = (\d+),/g)].map(([, name, number]) => [Number(number), name] as const);
  assert.ok(numbered.length > 0, 'the crate’s sources read');
  assert.deepEqual(
    numbered.sort(([one], [other]) => one - other),
    Object.keys(FROM_WORDS).map((name, number) => [number, name]),
  );
});
