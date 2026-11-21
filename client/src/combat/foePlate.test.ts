import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, FighterView } from '../rules/fighters.ts';
import { FoePlate, type MarkedFoe, plateTier, poiseTrackOf, THIRDS, wardOf } from './foePlate.ts';
import { ELEMENTS } from '../player/gear.ts';
import { FILLS } from '../plus/tones.ts';
import { pieceAt } from '../plus/barLoss.ts';
import { faded } from './barDraw.ts';
import { coloursDrawn, wordsIn, written } from './nodes.test.ts';

const view: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'foes',
  arms: 0,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 30,
  target: null,
  action: { kind: 'idle' },
};
const windUp = (iron: boolean, feint = false): Action => ({
  kind: 'telegraph',
  shape: 'sweep',
  elapsed: 4,
  windup: 40,
  origin: [0, 0, 0],
  bearing: 0,
  ahead: 2,
  iron,
  feintAt: feint ? 20 : null,
});
const rat = (id: number, changes: Partial<FighterView> = {}): MarkedFoe => ({
  id,
  name: 'Runner',
  view: { ...view, ...changes },
  rank: 2,
  faction: 'The Grey Tithe',
  phase: 1,
  alert: 2,
  factionNumber: 1,
  level: 7,
});

test('the poise track: nothing to say at rest, filling toward a break, iron red, staggered white, open after a miss', () => {
  assert.deepEqual(poiseTrackOf(view), { state: 'empty', fill: 0, word: '' });
  assert.deepEqual(poiseTrackOf({ ...view, action: windUp(false) }), { state: 'filling', fill: 0, word: '' });
  assert.deepEqual(poiseTrackOf({ ...view, poise: 12, action: windUp(false) }), {
    state: 'filling',
    fill: 0.4,
    word: '',
  });
  assert.deepEqual(poiseTrackOf({ ...view, poise: 12 }), { state: 'filling', fill: 0.4, word: '' }, 'poise taken');
  assert.equal(poiseTrackOf({ ...view, poise: 45, action: windUp(false) }).fill, 1, 'never past full');
  assert.deepEqual(poiseTrackOf({ ...view, action: windUp(true) }), { state: 'iron', fill: 1, word: 'Iron' });
  const staggered = { kind: 'staggered', left: 30, cause: 'poise' } as const;
  assert.deepEqual(poiseTrackOf({ ...view, action: staggered }), { state: 'staggered', fill: 1, word: 'Staggered' });
  const charged = { kind: 'staggered', left: 30, cause: 'charged' } as const;
  assert.deepEqual(poiseTrackOf({ ...view, action: charged }), { state: 'staggered', fill: 1, word: 'Charged' });
  assert.deepEqual(poiseTrackOf({ ...view, action: { kind: 'overreach', left: 30 } }), {
    state: 'open',
    fill: 0,
    word: 'Open',
  });
  assert.deepEqual(
    poiseTrackOf({ ...view, poise: 15, action: windUp(false, true) }),
    { state: 'filling', fill: 0.5, word: '' },
    'a feint tells no more on the track than on the ground',
  );
});

/** How many pieces a plate's health has falling. */
const falling = (plate: FoePlate) => plate.health.pieces.filter((piece) => pieceAt(piece.age, 'left')).length;
/** The plate laid as it stands over a figure, and the colours it draws. */
const overhead = (plate: FoePlate) => plate.node({ kind: 'overhead', width: 0 });
const drawn = (plate: FoePlate, kind: 'overhead' | 'target' = 'overhead') => {
  const made = plate.node({ kind, width: 340 });
  return made ? coloursDrawn(made) : new Set<string>();
};

test('the track flashes as its foe breaks into a stagger, never as the plate turns onto one already staggered', () => {
  const plate = new FoePlate({ poise: true, remembers: 'whole' });
  const staggered = { action: { kind: 'staggered', left: 30, cause: 'poise' } } as const;
  plate.show(rat(1, { poise: 20, action: windUp(false) }), 0);
  assert.deepEqual(plate.poiseShown, { state: 'filling', breaking: false });
  plate.show(rat(1, staggered), 1 / 60);
  assert.deepEqual(plate.poiseShown, { state: 'staggered', breaking: true }, 'this foe broke');
  plate.show(rat(2, staggered), 1 / 60);
  assert.deepEqual(plate.poiseShown, { state: 'staggered', breaking: false }, 'turned onto one already staggered');
  plate.show(rat(2), 1 / 60);
  assert.deepEqual(plate.poiseShown, { state: 'empty', breaking: false }, 'nothing to say: not drawn');
});

test('the plate remembers each foe’s health: one turned back to loses from where its bar stood, a new one as whole', () => {
  const plate = new FoePlate({ remembers: 'whole' });
  const lost = () => Math.round(plate.health.shown.at * 100);
  plate.show(rat(1, { health: 70 }), 0);
  assert.equal(lost(), 100, 'first shown after its first blow: taken as whole, so the blow reads');
  assert.equal(falling(plate), 1, 'and breaks off a piece');
  for (let frame = 0; frame < 120; frame++) plate.show(rat(1, { health: 70 }), 1 / 60);
  plate.show(rat(2, { health: 85 }), 1 / 60);
  for (let frame = 0; frame < 120; frame++) plate.show(rat(2, { health: 85 }), 1 / 60);
  plate.show(rat(1, { health: 40 }), 1 / 60);
  assert.equal(lost(), 70, 'the first again: its loss starts where its own bar stood, not the other’s');
  plate.keep(new Set([2]));
  for (let frame = 0; frame < 120; frame++) plate.show(rat(2, { health: 85 }), 1 / 60);
  plate.show(rat(1, { health: 40 }), 1 / 60);
  assert.equal(lost(), 100, 'gone and come again, a foe is forgotten: its number may be another’s');
});

test('a plate over a figure neither remembers nor breaks off pieces: it reads its foe as it first finds it', () => {
  const plate = new FoePlate();
  plate.show(rat(1, { health: 70 }), 0);
  assert.equal(plate.health.shown.at, 0.7);
  assert.equal(plate.health.pieces.length, 0);
});

test('the boss bar, which comes before any blow, takes a Boss it first shows as found, never as a phantom loss', () => {
  const plate = new FoePlate({ remembers: 'found' });
  plate.show(rat(9, { health: 54 }), 0);
  assert.equal(plate.health.shown.at, 0.54);
  assert.equal(falling(plate), 0);
  plate.show(rat(9, { health: 40 }), 1 / 60);
  assert.equal(falling(plate), 1, 'a blow seen still breaks off');
});

test('a shield’s ward stands over its foe’s health from the bar’s left end, its share of the whole health, in its element; gone once broken', () => {
  const plate = new FoePlate({ poise: true, remembers: 'whole' });
  const shielded = (left: number) => ({ ...rat(1), shield: { element: 2, left, most: 50 } });
  const ward = written(faded(ELEMENTS[2]?.colour ?? '', 0.9));
  plate.show(shielded(50), 1 / 60);
  assert.ok(drawn(plate, 'target').has(ward), 'drawn in Volt');
  assert.deepEqual(wardOf(shielded(50)), { share: 0.5, element: 2 });
  assert.deepEqual(wardOf(shielded(20)), { share: 0.2, element: 2 }, 'as it wears');
  // A blow the shield holds whole fills no poise in the room, and the track under the ward says nothing.
  assert.equal(poiseTrackOf(shielded(20).view).state, 'empty');
  plate.show(shielded(0), 1 / 60);
  assert.equal(drawn(plate, 'target').has(ward), false, 'broken');
  plate.show(rat(2), 1 / 60);
  assert.equal(drawn(plate, 'target').has(ward), false, 'a foe with none');
});

test('the plate’s square shows its foe’s level, not its faction’s emblem; a foe of no level leaves it empty', () => {
  const plate = new FoePlate();
  plate.show(rat(1), 0);
  assert.equal(wordsIn(overhead(plate))[0], '7');
  plate.show({ ...rat(2), level: 12 }, 1 / 60);
  assert.equal(wordsIn(overhead(plate))[0], '12', 'turned onto another foe');
  plate.show({ ...rat(3), level: 0 }, 1 / 60);
  assert.equal(wordsIn(overhead(plate))[0], 'Runner', 'its square empty');
});

test('an ally on the players’ side shows a green health bar; a foe its rank’s band', () => {
  const plate = new FoePlate();
  plate.show({ ...rat(1), rank: 1 }, 0);
  assert.ok(drawn(plate).has(written(FILLS.red)));
  plate.show({ ...rat(2, { side: 'players' }), rank: 1 }, 1 / 60);
  assert.ok(drawn(plate).has(written(FILLS.green)));
  assert.equal(drawn(plate).has(written(FILLS.red)), false);
});

test('a plate’s tier goes with its foe’s rank, and only an Elite’s and up over a figure is marked in thirds', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(plateTier), ['minor', 'major', 'elite', 'elite', 'elite']);
  const third = written(faded('#e2dccd', 0.6));
  const plate = new FoePlate();
  plate.show({ ...rat(1), rank: 1 }, 0);
  assert.equal(overhead(plate)?.width, 140, 'a Minor’s width');
  assert.equal(drawn(plate).has(third), false);
  plate.show({ ...rat(2), rank: 3 }, 1 / 60);
  assert.equal(overhead(plate)?.width, 176, 'turned onto an Elite');
  assert.ok(drawn(plate).has(third));
  assert.equal(drawn(plate, 'target').has(third), false, 'never on the target’s plate');
  assert.deepEqual(THIRDS, [1 / 3, 2 / 3]);
});
