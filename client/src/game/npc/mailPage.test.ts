import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { item, state } from '../../network/gearForTests.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface, UiEvent } from '../../ui/ui.ts';
import { fakeInterface, wordsIn } from '../../ui/uiForTests.ts';
import { sizesOf } from '../gearNodes.ts';
import type { MenuContext } from '../menuPage.ts';
import { FROM_WORDS, MAIL_MOST, letterRows, letterWords } from './mailPage.ts';
import { npcOpened, npcPage } from './npcScreen.ts';

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

// The Postmaster's thanks are typed a frame at a time, and no frame comes here.
globalThis.requestAnimationFrame ??= () => 0;

const VESTIGE = { id: 4, rarity: 2, slot: 2, level: 12, vaulted: false };
const LETTERS = [
  { id: 31, from: 0, crowded: false, vestige: VESTIGE, item: null },
  { id: 32, from: 4, crowded: true, vestige: null, item: item({ id: 0, rarity: 3, kind: 2 }) },
  { id: 33, from: 1, crowded: false, vestige: { ...VESTIGE, rarity: 4 }, item: null },
];

/** The Postmaster's screen drawn frame by frame `width` by `height`, with every ask it made and every card it
 *  offered; `gear` is what the room last sent, changed between frames as a test says. */
function postmasterOf(width: number, height: number, mail = LETTERS) {
  const { ui, step } = fakeInterface(width, height);
  const asked: GearAsk[] = [];
  const cards = new Map<string, () => Node>();
  let gear: GearState = state({ mail });
  const context = (): MenuContext =>
    ({
      ui,
      gear,
      sizes: sizesOf(width, height, 1),
      room: { width, height: height - 120 },
      ask: (ask: GearAsk) => asked.push(ask),
      card: (id: string, content: () => Node) => cards.set(id, content),
      picture: () => null,
      forge: null,
    }) as unknown as MenuContext;
  let built: Node = {};
  const frame = (events: UiEvent[] = []) => step(() => (built = npcPage(context(), 'mail')), events);
  frame();
  frame();
  const regear = (fields: Partial<GearState>) => (gear = { ...gear, ...fields });
  return { ui, asked, cards, frame, regear, tree: () => built };
}

/** A click on what `id` names, laid last frame. */
function click(ui: Interface, frame: (events: UiEvent[]) => void, id: string): void {
  const box = ui.boxOf(id);
  assert.ok(box, `${id} is laid`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  frame([
    { kind: 'pointer', x, y },
    { kind: 'down', x, y, button: 0 },
    { kind: 'up', x, y, button: 0 },
  ]);
}

test('the letters stand oldest first under their count of the most kept, each its tile, name, words and Take', () => {
  const { ui, cards, tree } = postmasterOf(1280, 720);
  const shown = wordsIn(tree());
  assert.ok(shown.includes(`${LETTERS.length}/${MAIL_MOST}`), 'the count of the fifty');
  const top = (id: string) => ui.boxOf(id)?.y ?? -1;
  const tops = LETTERS.map((letter) => top(`npc-take-${letter.id}`));
  assert.deepEqual(
    [...tops].sort((one, other) => one - other),
    tops,
    'oldest first',
  );
  assert.ok(top('npc-take-all') < (tops[0] ?? 0), 'Take all over them');
  assert.ok(
    LETTERS.every((letter) => ui.boxOf(`letter-${letter.id}`)),
    'each its tile',
  );
  assert.ok(
    LETTERS.map(letterWords).every((said) => shown.includes(said)),
    'each its words',
  );
  assert.ok(cards.has('letter-31') && cards.has('letter-32'), 'each tile its card under the pointer or the focus');
  const take = ui.boxOf('npc-take-31');
  const tile = ui.boxOf('letter-31');
  assert.ok(take && tile && take.x > tile.x + tile.width && Math.abs(take.y - tile.y) < tile.height, 'in a row');
});

test('a click on a letter’s Take or tile, or E on either, takes that letter once until the room answers; Take all takes every one', () => {
  const { ui, asked, frame, regear } = postmasterOf(1280, 720);
  click(ui, frame, 'npc-take-32');
  click(ui, frame, 'npc-take-32');
  assert.deepEqual(asked, [{ kind: ASKS.takeLetter, item: 32 }], 'once, while the room has not answered');
  regear({ answered: 1 });
  click(ui, frame, 'letter-32');
  assert.equal(asked.length, 2, 'asked again once the room answered and the letter still waits');
  ui.focusOn('letter-31');
  frame([{ kind: 'key', key: 'e' }]);
  assert.deepEqual(asked.at(-1), { kind: ASKS.takeLetter, item: 31 }, 'E on its tile');
  click(ui, frame, 'npc-take-all');
  assert.deepEqual(asked.at(-1), { kind: ASKS.takeAllLetters });
  regear({ mail: [] });
  frame();
  assert.equal(ui.boxOf('npc-take-all'), null, 'no Take all with none waiting');
});

test('an ask no room answered holds no letter back once his screen opens again, as in a room joined since', () => {
  const { ui, asked, frame } = postmasterOf(1280, 720);
  click(ui, frame, 'npc-take-31');
  npcOpened('mail');
  click(ui, frame, 'npc-take-31');
  assert.equal(asked.length, 2);
});

test('the focus on a letter taken goes to the same press of the letter after it, else the one before', () => {
  const { ui, frame, regear } = postmasterOf(1280, 720);
  ui.focusOn('npc-take-32');
  regear({ mail: LETTERS.filter((letter) => letter.id !== 32), answered: 1 });
  frame();
  assert.equal(ui.focusedId, 'npc-take-33');
  regear({ mail: LETTERS.filter((letter) => letter.id === 31), answered: 2 });
  frame();
  assert.equal(ui.focusedId, 'npc-take-31', 'the last taken: the one before');
  ui.focusOn('letter-31');
  regear({ mail: LETTERS, answered: 3 });
  frame();
  regear({ mail: LETTERS.filter((letter) => letter.id !== 31), answered: 4 });
  frame();
  assert.equal(ui.focusedId, 'letter-32', 'a tile’s to the next tile');
});

test('on a phone the Postmaster stands over his letters, which take the room’s whole width', () => {
  const rows = (width: number, height: number) => postmasterOf(width, height).ui.boxOf('npc-rows');
  const [phone, wide] = [rows(390, 844), rows(1280, 720)];
  assert.ok(phone && wide);
  assert.ok(phone.width > 390 * 0.8 && phone.y > (844 - 120) / 4, 'the whole width, under him');
  assert.ok(wide.x > 1280 / 3, 'beside him where there is room');
});

test('on a phone a letter stands in one column: its tile and name, its words under them, its Take at its end', () => {
  const { ui } = postmasterOf(390, 844);
  const [tile, take] = [ui.boxOf('letter-31'), ui.boxOf('npc-take-31')];
  assert.ok(tile && take);
  assert.ok(take.y >= tile.y + tile.height, 'its Take under its tile');
  assert.ok(take.x + take.width > tile.x + tile.width, 'at the end of the well');
});
