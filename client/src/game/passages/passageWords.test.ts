import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PassageWeb, PassageZone } from '../../rules/passageRules.ts';
import {
  dealTracker,
  depthWords,
  HAUL_WARNING,
  haulView,
  lampPrompt,
  leaveWarning,
  mouthsChoice,
  onwardSign,
  type PassageHaul,
  type PassageWord,
} from './passageWords.ts';
import { weekStart } from '../guild/guildLaw.ts';

const zone = (number: number, extra: Partial<PassageZone> = {}): PassageZone => ({
  number,
  depth: 1,
  lane: 0,
  at: [0, 0],
  ground: { kind: 'under', style: 'chalk' },
  size: 'small',
  deal: 'kindle',
  currents: [{ key: 'gloom', name: 'Gloom', words: 'It is dark here.', boon: false }],
  name: 'A chalk cut',
  onward: [],
  lamp: null,
  ...extra,
});

// What the rules will send, as fixtures: a web of a mouth's zone and two lamps.
const web: PassageWeb = {
  island: 'continent-1',
  patrol: 'saltgrass-downs',
  week: 2_900,
  mouths: [{ run: 'The Chalk Adit', zone: 0 }],
  modifiers: [{ key: 'trickle', name: 'Trickle', words: 'Arts take 50% longer to recharge.' }],
  zones: [zone(0), zone(1, { depth: 5, deal: 'lamp', lamp: 1 }), zone(2, { depth: 10, deal: 'lamp', lamp: 2 })],
};
const empty: PassageHaul = { items: [], vestiges: 0, materials: [], lantern: false };

test('the mouths’ choice offers the public passage and one route of one’s own, and each lamp lit this week', () => {
  const alone = mouthsChoice(web, 'The Chalk Adit', false, [2]);
  assert.ok(alone);
  assert.deepEqual(
    alone.routes.map((route) => route.words),
    ['The public passage', 'Your own route, alone'],
  );
  assert.deepEqual(
    alone.starts.map((start) => start.words),
    ['Go in', 'Begin at the second lamp'],
  );
  assert.equal(alone.beyond.name, 'A chalk cut');
  assert.equal(alone.modifiers[0]?.name, 'Trickle');
  const company = mouthsChoice(web, 'The Chalk Adit', true, [2, 1, 2, 7]);
  assert.deepEqual(company?.routes[1]?.route, 'company');
  assert.deepEqual(
    company?.starts.map((start) => start.lamp),
    [null, 1, 2],
    'each lamp once, in order, none the web lacks',
  );
  assert.equal(mouthsChoice(web, 'The Beacon Stair', false, []), null);
});

test('an onward mouth’s sign names the zone beyond, its deal, depth and currents, and why it is shut', () => {
  const shut = onwardSign(zone(3, { depth: 8 }), false);
  assert.deepEqual(
    [shut.name, shut.depth, shut.deal],
    ['A chalk cut', '8 zones deep', 'A Kindle: three dead lamps wait to be lit.'],
  );
  assert.equal(shut.kind, 'Kindle', 'a mission by its kind’s name');
  assert.equal(shut.currents[0]?.name, 'Gloom');
  assert.ok(shut.shut);
  assert.equal(onwardSign(zone(3), true).shut, null);
  const cold = onwardSign(zone(4, { deal: 'lamp', lamp: 3 }), true);
  assert.equal(cold.deal, 'The third lamp, cold, its guard standing.', 'a lamp not lit burns for no one');
  assert.equal(
    onwardSign(zone(4, { deal: 'lamp', lamp: 3 }), true, 1, [3]).deal,
    'The third lamp, lit by you this week.',
  );
  assert.match(onwardSign(zone(5, { deal: 'gauntlet' }), true).deal, /90 s/, 'the Gauntlet says its time');
  assert.equal(onwardSign(zone(5, { deal: 'vault' }), true).deal, 'A vault, its keeper deep inside.');
});

test('a sign says its zone’s foes’ levels, too strong for the player three or more levels over them', () => {
  const deep = zone(6, { depth: 15, levels: [15, 18] });
  assert.deepEqual([onwardSign(deep, true, 16).foes, onwardSign(deep, true, 16).hard], ['Foes 15 to 18', false]);
  assert.equal(onwardSign(deep, true, 15).hard, true, 'three levels under its strongest');
  assert.equal(onwardSign(deep, true, 12).hard, true, 'a level 12 player cannot harm a level 18 foe');
  assert.equal(onwardSign(zone(7), true, 1).foes, null, 'none where the web does not say');
});

test('the card names the zone a begin at a lamp lands in, the lamp’s zone at the mouth’s place, and its foes', () => {
  const lanes: PassageWeb = {
    ...web,
    mouths: [...web.mouths, { run: 'The Beacon Stair', zone: 0 }],
    zones: [
      zone(0),
      zone(1, { depth: 5, deal: 'lamp', lamp: 1, name: 'A near barrow', levels: [9, 12] }),
      zone(2, { depth: 5, deal: 'lamp', lamp: 1, name: 'A far barrow' }),
    ],
  };
  const start = mouthsChoice(lanes, 'The Chalk Adit', false, [1], 8)?.starts[1];
  assert.deepEqual(start?.zone, { words: 'The first lamp: A near barrow · Foes 9 to 12', hard: true });
  const second = mouthsChoice(lanes, 'The Beacon Stair', false, [1], 8)?.starts[1];
  assert.deepEqual(second?.zone, { words: 'The first lamp: A far barrow', hard: false }, 'the second mouth’s');
});

test('the lamp is held to light; lit, it offers Home or going on', () => {
  assert.equal(lampPrompt(false, false).deed, 'Light the lamp');
  assert.match(lampPrompt(false, true).under ?? '', /guard/);
  assert.equal(lampPrompt(true, false).deed, 'Home');
});

test('the haul lists what is carried and warns that a fall or leaving loses it; empty, it says nothing', () => {
  const haul: PassageHaul = {
    items: [{ name: 'Gorse Hauberk', rarity: 'Rare' }],
    vestiges: 2,
    materials: [{ name: 'Brineglass', count: 3 }],
    lantern: true,
  };
  assert.deepEqual(haulView(haul), {
    lines: ['Gorse Hauberk · Rare', '2 Vestiges', 'Brineglass × 3', 'A cold lantern'],
    warning: HAUL_WARNING,
  });
  assert.deepEqual(haulView(empty), { lines: [], warning: null });
  assert.equal(leaveWarning(empty), null);
  assert.ok(leaveWarning(haul));
});

/** The room's word: the deal's progress, the mouths open for the player, the lamp and a vein's nodes gathered. */
const word = (deal: Partial<PassageWord['deal']>, extra: Partial<PassageWord> = {}): PassageWord => ({
  zone: 0,
  deal: { done: false, count: null, seconds: null, late: false, ...deal },
  lampLit: null,
  openMouths: [],
  haul: empty,
  ...extra,
});
/** A moment a day from the week's turn, so no shift is near. */
const NOW = weekStart(2_900) + 86_400_000;
const onward = { onward: [1] };

test('the deal’s tracker says what is to do and how far it is', () => {
  const kindling = dealTracker(zone(0, onward), word({ count: 1 }), NOW);
  assert.deepEqual(kindling.steps, [{ text: 'Light the dead lamps', done: false, count: '1/3' }]);
  const hold = dealTracker(zone(0, { deal: 'hold' }), word({ seconds: 42 }), NOW);
  assert.equal(hold.steps[0]?.clock, 42);
  const done = dealTracker(zone(0, onward), word({ done: true, count: 3 }, { openMouths: [0] }), NOW);
  assert.equal(done.steps.at(-1)?.text, 'Go on through an open mouth');
  const late = dealTracker(zone(0, { deal: 'gauntlet' }), word({ seconds: 0, late: true }), NOW);
  assert.match(late.steps[0]?.text ?? '', /cache is lost/);
});

test('the tracker keys each step to the room’s word: a round done before one came, or begun again after', () => {
  const skirmish = zone(0, { deal: 'skirmish', ...onward });
  const came = dealTracker(skirmish, word({ done: true, again: 37 }), NOW);
  assert.deepEqual(came.steps, [{ text: 'Done before you came: it begins again', clock: 37 }], 'no way on yet');
  const again = dealTracker(skirmish, word({ done: false }, { openMouths: [0] }), NOW);
  assert.deepEqual(
    again.steps.map((step) => [step.text, step.done]),
    [
      ['Bring down the garrison', true],
      ['Go on through an open mouth', undefined],
    ],
    'begun again, the player’s mouths stand open: their work is done',
  );
});

test('the tracker says the depth and the next lamp, the lamp to light, and no way on at the deepest', () => {
  assert.equal(depthWords(7), 'Depth 7, the second lamp in 3');
  assert.equal(depthWords(10), 'Depth 10, the third lamp in 5');
  assert.equal(depthWords(20), 'Depth 20, the deepest');
  const kindle = dealTracker(zone(0, { depth: 7 }), word({}), NOW);
  assert.deepEqual([kindle.name, kindle.task], ['Depth 7, the second lamp in 3', 'Kindle']);
  const deepest = zone(0, { depth: 20, deal: 'lamp', lamp: 4 });
  const unlit = dealTracker(deepest, word({ done: true }, { openMouths: [], lampLit: false }), NOW);
  assert.ok(!unlit.steps.some((step) => /Go on/.test(step.text)), 'no way on from the deepest');
  const lighting = dealTracker(
    zone(0, { depth: 5, deal: 'lamp', lamp: 1, ...onward }),
    word({}, { lampLit: false }),
    NOW,
  );
  assert.deepEqual(lighting.steps.at(-1), { text: 'Light the lamp', done: false });
  const lit = dealTracker(deepest, word({ done: true }, { openMouths: [], open: true, lampLit: true }), NOW);
  assert.deepEqual(
    lit.steps.map((step) => [step.text, step.done]),
    [
      ['Bring down the lamp’s guard', true],
      ['Light the lamp', true],
      ['Home from the lamp', undefined],
    ],
    'the deepest has no mouth, yet its work is done for the player',
  );
});

test('a Gauntlet keeps its clock though its mouths stand open from the start', () => {
  const run = dealTracker(zone(0, { deal: 'gauntlet', ...onward }), word({ seconds: 55 }, { open: true }), NOW);
  assert.deepEqual(run.steps[0], { text: 'Reach the far mouth', done: false, clock: 55 });
});

test('a route’s round done before a member came stands done: it never begins again', () => {
  const late = word({ done: true }, { open: false, public: false });
  const steps = dealTracker(zone(0, { deal: 'hold', ...onward }), late, NOW).steps;
  assert.deepEqual(steps[0], { text: 'Hold the ring', done: true });
});

test('a vein counts the nodes its zone lays', () => {
  const few = dealTracker(zone(0, { deal: 'vein' }), word({ done: true }, { open: true, gathered: 5, nodes: 5 }), NOW);
  assert.deepEqual(few.steps[1], { text: 'Gather its nodes', count: '5/5', done: true });
});

test('a vein counts its six nodes once its guard is down; a reliquary asks only for its guard', () => {
  const vein = dealTracker(zone(0, { deal: 'vein' }), word({ done: true }, { openMouths: [0], gathered: 2 }), NOW);
  assert.deepEqual(vein.steps.slice(0, 2), [
    { text: 'Bring down the vein’s guard', done: true },
    { text: 'Gather its nodes', count: '2/6', done: false },
  ]);
  const chest = dealTracker(zone(0, { deal: 'reliquary' }), word({}), NOW);
  assert.equal(chest.steps[0]?.text, 'Bring down the reliquary’s guard');
});

test('in the last ten minutes before Tuesday 09:00 UTC the tracker warns that the web will shift', () => {
  const turn = weekStart(2_901);
  const near = dealTracker(zone(0), word({}), turn - 300_000);
  assert.deepEqual(near.steps.at(-1), { text: 'The web shifts: its ways lead elsewhere', clock: 300 });
  assert.ok(!dealTracker(zone(0), word({}), turn - 900_000).steps.some((step) => /shifts/.test(step.text)));
});
