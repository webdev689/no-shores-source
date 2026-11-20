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
const captainAt = (x: number, state: FightVessel['state'], id = 1): FightCaptain => ({
  ...vessel,
  id,
  // The rules' own pose rides their own swell: the drawing takes her settling from `founder` alone.
  pose: [state === 'sinking' ? -7 : 0, 0, 0.1, 0],
  founder: state === 'sinking' ? [3, 0, 0.4] : [0, 0, 0],
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
  const [first, ...rest] = states.map((state, index) => captainAt(5000 + 100 * index, state, index + 1));
  if (!first) throw new Error('a fight has a captain');
  return {
    clock: 0,
    player: vessel,
    captain: first,
    others: rest,
    balls: [],
    lay: null,
    events,
    over: states.every((state) => state !== 'afloat') ? 'beaten' : null,
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
    fightStep: (_orders: unknown, _time: number, _ticks: number, told: readonly [number, number]) => {
      winds.push(told);
      return Promise.resolve(steps.shift() ?? viewOf(['sunk', 'sunk', 'sunk']));
    },
    fightEnd: () => Promise.resolve(),
  } as unknown as LandWorker;
  const marks = { drawInto: () => undefined } as unknown as MarkDrawer;
  // The story's storm, and the wind it eases to: every step sails in the wind the story blows as it is sent.
  const winds: (readonly [number, number])[] = [];
  let wind: readonly [number, number] = [14, 6];
  const pirate = { distanceM: 300, faction: 2, rank: 1 } as const;
  const ambushers = [0, 2, 4].map((bearing) => ({ ...pirate, bearing }));
  const fight = await StoryFight.begin(
    land,
    { x: 5000, y: 6000, heading: -Math.PI / 2 },
    ambushers,
    { sails: [], marks },
    0,
    () => wind,
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
  assert.equal(first.left, 3);
  assert.equal(first.over, false);
  assert.ok(first.ships[0]?.place && first.ships[0].place.x === 5000);
  // Each frame steps the fight once a step's answer is in.
  let frame = first;
  const heard: string[] = [];
  for (let step = 1; step < 20 && !frame.over; step++) {
    await new Promise((settle) => setTimeout(settle, 0));
    if (step === 1) wind = [3, 1];
    frame = fight.frame({ ...input, time: step * 0.1 });
    heard.push(...frame.happened);
    // A captain going down settles and lists as her hurts have her, on the story's swell.
    if (frame.happened.includes('sinking')) {
      const going = frame.ships[2]?.place;
      assert.ok(going && going.z === -3 && going.roll === 0.4, JSON.stringify(going));
      assert.equal(frame.left, 2);
    }
  }
  assert.deepEqual(heard, ['sinking', 'sunk']);
  assert.equal(frame.left, 0);
  assert.equal(frame.over, true);
  assert.ok(frame.ships.slice(1).every((ship) => ship.sunk));
  assert.deepEqual(winds[0], [14, 6], 'the first step sails in the storm drawn round her');
  assert.deepEqual(winds.at(-1), [3, 1], 'a later one in the wind the story eased to');
  assert.equal(frame.hulls.length, 1, 'only her footprint while the captains are gone');
});

/** The land door, its fight begun with three afloat, then answering each step from `steps` in turn. */
function door(steps: (() => Promise<FightView>)[]): LandWorker {
  return {
    fightBegin: () => Promise.resolve(viewOf(['afloat', 'afloat', 'afloat'])),
    fightStep: () => (steps.shift() ?? (() => Promise.resolve(viewOf(['afloat', 'afloat', 'afloat']))))(),
    fightEnd: () => Promise.resolve(),
  } as unknown as LandWorker;
}

const begunOn = (land: LandWorker) =>
  StoryFight.begin(
    land,
    { x: 5000, y: 6000, heading: 0 },
    [0, 2, 4].map((bearing) => ({ bearing, distanceM: 300, faction: 2, rank: 2 }) as const),
    { sails: [], marks: { drawInto: () => undefined } as unknown as MarkDrawer },
    0,
    () => [14, 6],
  );

test('a struck captain is beaten: one fewer is left to beat, and the fight is over once none fights', async () => {
  const fight = await begunOn(
    door([
      () => Promise.resolve(viewOf(['afloat', 'struck', 'afloat'])),
      () => Promise.resolve(viewOf(['struck', 'struck', 'sinking'])),
    ]),
  );
  const input = { seconds: 0.1, time: 0, far: 1000, swell: undefined };
  const lefts: number[] = [];
  let frame = fight.frame(input);
  for (let step = 1; step < 10 && !frame.over; step++) {
    await new Promise((settle) => setTimeout(settle, 0));
    frame = fight.frame({ ...input, time: step * 0.1 });
    lefts.push(frame.left);
  }
  assert.ok(lefts.includes(2) && lefts.at(-1) === 0, lefts.join());
  assert.equal(frame.over, true);
  assert.deepEqual(
    frame.ships.slice(1).map((ship) => ship.state),
    ['struck', 'struck', 'sinking'],
  );
});

test('a step the rules refuse is thrown from the next frame, for the director to go on past it', async () => {
  const fight = await begunOn(door([() => Promise.reject(new Error('no fight is on'))]));
  const input = { seconds: 0.1, time: 0, far: 1000, swell: undefined };
  fight.frame(input);
  await new Promise((settle) => setTimeout(settle, 0));
  assert.throws(() => fight.frame({ ...input, time: 0.1 }), /no fight is on/);
});
