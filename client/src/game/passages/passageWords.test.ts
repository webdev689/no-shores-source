import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PassageWeb, PassageZone } from '../../rules/passageRules.ts';
import {
  dealTracker,
  HAUL_WARNING,
  haulView,
  lampPrompt,
  leaveWarning,
  mouthsChoice,
  onwardSign,
  type PassageHaul,
} from './passageWords.ts';

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
    ['A chalk cut', '8 zones deep', 'Three dead lamps wait to be lit.'],
  );
  assert.equal(shut.currents[0]?.name, 'Gloom');
  assert.ok(shut.shut);
  assert.equal(onwardSign(zone(3), true).shut, null);
  assert.equal(onwardSign(zone(4, { deal: 'lamp', lamp: 3 }), true).deal, 'The third lamp burns there.');
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

test('the deal’s tracker says what is to do and how far it is', () => {
  const kindling = dealTracker(zone(0), { done: false, count: 1, seconds: null, late: false });
  assert.deepEqual(kindling.steps, [{ text: 'Light the dead lamps', done: false, count: '1/3' }]);
  const hold = dealTracker(zone(0, { deal: 'hold' }), { done: false, count: null, seconds: 42, late: false });
  assert.equal(hold.steps[0]?.clock, 42);
  const done = dealTracker(zone(0), { done: true, count: 3, seconds: null, late: false });
  assert.equal(done.steps.at(-1)?.text, 'Go on through an open mouth');
  const late = dealTracker(zone(0, { deal: 'gauntlet' }), { done: false, count: null, seconds: 0, late: true });
  assert.match(late.steps[0]?.text ?? '', /cache is lost/);
});
