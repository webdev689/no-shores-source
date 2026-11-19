import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarkDrawer } from '../../editor/naval.ts';
import type { CaptainAt, FightCaptain, FightEvent, FightVessel, FightView } from '../../rules/fightRules.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import { ambushersAt, happenedOf, StoryFight } from './fightAtSea.ts';

const near = (value: number, to: number): boolean => Math.abs(value - to) < 1e-6;

test('each ambusher is put to sea on her bearing off the bow, at her distance, heading for the player unless told', () => {
  const ship = { x: 1000, y: 2000, heading: Math.PI / 2 };
  const [ahead, astern, toPort] = ambushersAt(ship, [
    { bearing: 0, distanceM: 400, faction: 2, rank: 1 },
    { bearing: Math.PI, distanceM: 300, faction: 1, rank: 3, heading: 1 },
    { bearing: -Math.PI / 2, distanceM: 500, faction: 2, rank: 2 },
  ]);
  // Heading east, her bow points +x; her port side is north (-y).
  assert.ok(ahead && near(ahead.x, 1400) && near(ahead.y, 2000), JSON.stringify(ahead));
  assert.ok(near(ahead.heading, (3 * Math.PI) / 2), 'ahead of her, she heads west for her');
  assert.equal(ahead.faction, 2);
  assert.ok(astern && near(astern.x, 700) && near(astern.y, 2000) && astern.heading === 1 && astern.rank === 3);
  assert.ok(toPort && near(toPort.x, 1000) && near(toPort.y, 1500) && near(toPort.heading, Math.PI));
});

test('the story hears a ball strike her, hers strike a captain, and a captain go down and sink, and nothing else', () => {
  const point = [0, 0, 0] as const;
  const events: FightEvent[] = [
    { kind: 'muzzle', ship: 1, point, launch: point },
    { kind: 'hit', ship: 0, by: 2, zone: 'hull', point },
    { kind: 'hit', ship: 1, by: 0, zone: 'rig', point },
    { kind: 'hit', ship: 1, by: 2, zone: 'hull', point },
    { kind: 'state', ship: 0, state: 'sinking' },
    { kind: 'state', ship: 2, state: 'struck' },
    { kind: 'state', ship: 2, state: 'sinking' },
    { kind: 'state', ship: 2, state: 'sunk' },
    { kind: 'splash', point },
  ];
  assert.deepEqual(happenedOf(events), ['hit-taken', 'hit-given', 'sinking', 'sunk']);
});

const vessel: FightVessel = {
  ship: [5000, 6000, 0, 0, 0, 0, 0, 2],
  pose: [0, 0, 0, 0],
  hull: 240,
  max_hull: 240,
  sail: 96,
  max_sail: 96,
  crew: 0,
  max_crew: 0,
  state: 'afloat',
  fires: 0,
  guns: { left: [0, 0], progress: [1, 1], load: 'round', braced: false },
};
const captainAt = (x: number, state: FightVessel['state']): FightCaptain => ({
  ...vessel,
  pose: [state === 'sinking' ? -3 : 0, 0, 0.4, 0],
  ship: [x, 5600, 2, 0, 0, 0, 0, 2],
  state,
  name: 'Pirate Sloop',
  faction: 2,
  rank: 1,
  mode: 'engage',
  hostile: true,
  run_out: [],
});
const viewOf = (states: readonly FightVessel['state'][], events: FightEvent[] = []): FightView => {
  const [first, ...rest] = states.map((state, index) => captainAt(5000 + 100 * index, state));
  if (!first) throw new Error('a fight has a captain');
  return {
    clock: 0,
    player: vessel,
    captain: first,
    others: rest,
    balls: [],
    lay: null,
    events,
    over: states.every((state) => state === 'sunk') ? 'sunk' : null,
    fingerprint: '',
  };
};

test('the story fight begins on the land door with its captains, draws them, hears its steps and is over once all sink', async () => {
  let begun: readonly CaptainAt[] = [];
  let heading = Number.NaN;
  const steps = [
    viewOf(['afloat', 'sinking', 'afloat'], [{ kind: 'state', ship: 2, state: 'sinking' }]),
    viewOf(['sunk', 'sunk', 'sunk'], [{ kind: 'state', ship: 1, state: 'sunk' }]),
  ];
  const land = {
    fightBegin: (ship: Float64Array, _seed: number, _time: number, captains: readonly CaptainAt[]) => {
      [begun, heading] = [captains, ship[2] ?? Number.NaN];
      return Promise.resolve(viewOf(['afloat', 'afloat', 'afloat']));
    },
    fightStep: () => Promise.resolve(steps.shift() ?? viewOf(['sunk', 'sunk', 'sunk'])),
    fightEnd: () => Promise.resolve(),
  } as unknown as LandWorker;
  const marks = { drawInto: () => undefined } as unknown as MarkDrawer;
  const pirate = { distanceM: 300, faction: 2, rank: 1 } as const;
  const ambushers = [0, 2, 4].map((bearing) => ({ ...pirate, bearing }));
  const fight = await StoryFight.begin(
    land,
    { x: 5000, y: 6000, heading: -Math.PI / 2 },
    ambushers,
    { sails: [], marks },
    0,
  );
  assert.equal(begun.length, 3);
  assert.ok(Math.abs(heading - (3 * Math.PI) / 2) < 1e-9, 'a heading past either end is wrapped for the rules');
  const input = { seconds: 0.1, time: 0, far: 1000, swell: undefined };
  const first = fight.frame(input);
  assert.deepEqual(
    first.ships.map((ship) => [ship.hull, ship.shade]),
    [
      ['own', 1],
      ['captain', 0.55],
      ['captain', 0.55],
      ['captain', 0.55],
    ],
  );
  assert.equal(first.afloat, 3);
  assert.equal(first.over, false);
  assert.ok(first.ships[0]?.place && first.ships[0].place.x === 5000);
  // Each frame steps the fight once a step's answer is in.
  let frame = first;
  const heard: string[] = [];
  for (let step = 1; step < 20 && !frame.over; step++) {
    await new Promise((settle) => setTimeout(settle, 0));
    frame = fight.frame({ ...input, time: step * 0.1 });
    heard.push(...frame.happened);
    // A captain going down settles and lists as the rules have her, not on the story's swell.
    if (frame.happened.includes('sinking')) {
      const going = frame.ships[2]?.place;
      assert.ok(going && going.z === -3 && going.roll === 0.4, JSON.stringify(going));
      assert.equal(frame.afloat, 2);
    }
  }
  assert.deepEqual(heard, ['sinking', 'sunk']);
  assert.equal(frame.afloat, 0);
  assert.equal(frame.over, true);
  assert.ok(frame.ships.slice(1).every((ship) => ship.sunk));
  assert.equal(frame.hulls.length, 1, 'only her footprint while the captains are gone');
});
