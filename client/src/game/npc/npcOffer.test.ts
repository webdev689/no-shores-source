import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { state } from '../../network/gearForTests.ts';
import type { UiEvent } from '../../ui/ui.ts';
import { fakeInterface } from '../../ui/uiForTests.ts';
import { Holds } from '../gearHold.ts';
import { sizesOf } from '../gearNodes.ts';
import type { MenuContext } from '../menuPage.ts';
import { COUNTERS, QUESTS } from '../quests/questBook.ts';
import { npcOpened, npcPage } from './npcScreen.ts';
import { rowsOf } from './npcWares.ts';

// The keeper's thanks are typed a frame at a time, and no frame comes here.
globalThis.requestAnimationFrame ??= () => 0;

const WEAPONSMITH = COUNTERS['weaponsmith'] ?? 0;
const OPENING = QUESTS.findIndex((quest) => quest.id === 'house') + 1;
const ROUND = QUESTS[OPENING - 1]?.tasks.findIndex((task) => task.id === 'find-your-way') ?? 0;
const QUEST = { quest: OPENING, task: ROUND, counts: [] as number[], done: [0, 0, 0, 0], choices: [0, 0, 0], at: null };

/** A keeper's screen drawn frame by frame, by default the Weaponsmith's offering the round (her supplies on sale),
 *  with every ask it made. */
function screenOf(kind: 'weaponsmith' | 'armorsmith' = 'weaponsmith', quest = { ...QUEST, offered: WEAPONSMITH }) {
  const { ui, step } = fakeInterface(1280, 720);
  const asked: GearAsk[] = [];
  const cards: string[] = [];
  const holds = new Holds(() => 0);
  let gear: GearState = state({ quest, cratePrice: 300 });
  const context = (): MenuContext =>
    ({
      ui,
      gear,
      sizes: sizesOf(1280, 720, 1),
      room: { width: 1280, height: 600 },
      holds,
      ask: (ask: GearAsk) => asked.push(ask),
      card: (id: string) => cards.push(id),
      picture: () => null,
      forge: null,
    }) as unknown as MenuContext;
  npcOpened(kind);
  const frame = (events: UiEvent[] = []) =>
    step(() => {
      holds.frame(ui);
      const page = npcPage(context(), kind);
      holds.end();
      return page;
    }, events);
  frame();
  frame();
  const regear = (fields: Partial<GearState>) => (gear = { ...gear, ...fields });
  return { ui, asked, cards, frame, regear, gear: () => gear };
}

test('opening the screen of a keeper a talk goal names tells the room the word (ask 64), once; an offer asks none', () => {
  const armorsmith = screenOf('armorsmith', { ...QUEST, counts: [1, 0, 0, 0, 0, 0, 0], offered: 0 });
  armorsmith.frame();
  assert.deepEqual(armorsmith.asked, [{ kind: ASKS.speakWith, column: COUNTERS['armorsmith'] }]);
  const weaponsmith = screenOf();
  assert.deepEqual(weaponsmith.asked, [], 'Acquire is the word with a keeper offering a quest');
});

test('Acquire asks the room for the quest at this keeper once until it answers, then the focus moves on', () => {
  const { ui, asked, frame, regear } = screenOf();
  assert.equal(ui.focusedId, 'npc-acquire', 'Acquire takes the focus');
  const box = ui.boxOf('npc-acquire');
  assert.ok(box, 'Acquire is laid');
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const press = () =>
    frame([
      { kind: 'pointer', x, y },
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
  press();
  press();
  assert.deepEqual(
    asked.filter((ask) => ask.kind === ASKS.acquire),
    [{ kind: ASKS.acquire, column: WEAPONSMITH }],
    'the keeper by their counter, once while the room has not answered',
  );
  // The room's answer: acquired, the offer gone.
  regear({ quest: { ...QUEST, counts: [1], offered: 0 }, answered: 2 });
  frame();
  frame();
  assert.equal(ui.boxOf('npc-acquire'), null, 'nothing more to acquire');
  assert.ok(ui.focusedId?.startsWith('npc-'), `the focus on a ware beside it, not lost (${ui.focusedId})`);
});

test('an acquired quest steps aside for the wares: its small gold tile and name, its card on the pointer, keys or a tap', () => {
  const { ui, cards, frame } = screenOf('weaponsmith', { ...QUEST, counts: [1], offered: 0 });
  assert.equal(ui.boxOf('npc-acquire'), null, 'nothing to acquire');
  const tile = ui.boxOf('npc-quest');
  assert.ok(tile, 'the acquired quest is a tile');
  assert.ok(tile.height <= 80, `a small tile, not the card (${tile.height} px)`);
  assert.ok(tile.y < 200, `beside the crest at the top, not under the wares (${tile.y})`);
  assert.equal(ui.boxOf('npc-quest-card'), null, 'its card not laid in the rows');
  assert.ok(cards.includes('npc-quest'), 'its card shows where the tile is pointed at or focused');
  const [x, y] = [tile.x + tile.width / 2, tile.y + tile.height / 2];
  const tap = () =>
    frame([
      { kind: 'pointer', x, y },
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
  tap();
  frame();
  assert.ok(ui.boxOf('npc-quest-card'), 'a tap (or a press) opens its card in the rows, as a phone has no pointer');
  tap();
  frame();
  assert.equal(ui.boxOf('npc-quest-card'), null, 'and a second closes it');
});

test('while a quest is offered its card leads and the wares stand beside it, in sight without scrolling', () => {
  const { ui, gear } = screenOf();
  const card = ui.boxOf('npc-acquire');
  const first = rowsOf('weaponsmith', gear(), false)[0]?.wares[0];
  const ware = first ? ui.boxOf(`npc-${first.key}`) : null;
  assert.ok(card && ware, 'Acquire and a ware are laid');
  assert.ok(ware.y + ware.height <= 720, `the first ware is in sight (${ware.y + ware.height} px of 720)`);
  assert.ok(ware.x >= card.x + card.width, 'beside the card, right of its Acquire at its right edge');
});

test("an acquired quest's tile keeps the focus from being lost when it is done, and its card shuts for the next", () => {
  const { ui, frame, regear } = screenOf('weaponsmith', { ...QUEST, counts: [1], offered: 0 });
  const tile = ui.boxOf('npc-quest');
  assert.ok(tile);
  const [x, y] = [tile.x + tile.width / 2, tile.y + tile.height / 2];
  frame([
    { kind: 'pointer', x, y },
    { kind: 'down', x, y, button: 0 },
    { kind: 'up', x, y, button: 0 },
  ]);
  frame();
  assert.ok(ui.boxOf('npc-quest-card'), 'opened');
  ui.focusOn('npc-quest');
  // The opening done: the player walks a house's road, which she does not offer.
  const ROAD = QUESTS.findIndex((quest) => quest.id === 'lamplighters') + 1;
  regear({ quest: { ...QUEST, quest: ROAD, task: 0, counts: [] } });
  frame();
  frame();
  assert.equal(ui.boxOf('npc-quest'), null, 'the tile gone with its quest');
  assert.ok(ui.focusedId?.startsWith('npc-'), `the focus on a ware beside it, not lost (${ui.focusedId})`);
  regear({ quest: { ...QUEST, counts: [1], offered: 0 } });
  frame();
  frame();
  assert.equal(ui.boxOf('npc-quest-card'), null, 'a quest acquired again shows as its tile, its card shut');
});
