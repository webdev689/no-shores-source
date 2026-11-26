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
      card: () => undefined,
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
  return { ui, asked, frame, regear };
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
