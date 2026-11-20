import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FeelEvent, type FeelShip, FightFeel, feelOf, frameOf } from './fightFeel.ts';
import { hullSails } from './hulls.ts';
import { SailRig } from './sails.ts';

const here = (point: readonly [number, number, number]) => [point[0], point[1], point[2]] as const;

/** A Brig lying at (100, 50) heading east, unhurt unless said. */
function brig(state = 'afloat', sail = 100): FeelShip {
  const rig = new SailRig(hullSails(2));
  for (let tick = 0; tick < 240; tick++) rig.step(1 / 60, { offDeg: 90, set: true }, tick / 60);
  return {
    vessel: { ship: [100, 50, Math.PI / 2, 4], pose: [0, 0, 0], fires: 0, sail, max_sail: 100, state },
    rig,
    hull: 2,
    side: 'pirate',
  };
}

function frame(feel: FightFeel, ships: Map<number, FeelShip>, events: readonly FeelEvent[], now: number) {
  return feel.frame({ events, ships, balls: [], now, seconds: 1 / 30, windBearing: Math.PI, toWindow: here });
}

test("a world point turned into her frame is her bow's forward and her starboard's side", () => {
  const { vessel } = brig();
  const [ahead, aside, up] = frameOf(vessel, [110, 53, 2]);
  assert.ok(Math.abs(ahead - 10) < 1e-9 && Math.abs(aside - 3) < 1e-9 && Math.abs(up - 2) < 1e-9);
});

test('a splash event throws its spray, stirs the water and calls for the splash sound', () => {
  const feel = new FightFeel(1);
  const stirs = frame(feel, new Map(), [{ kind: 'splash', at: [20, 30] }], 0);
  assert.deepEqual([stirs[0]?.x, stirs[0]?.y], [20, 30]);
  assert.ok(feel.marks(0.3).length > 10);
  assert.deepEqual(
    feel.takeCues().map((cue) => cue.cue),
    ['shot.splash'],
  );
  assert.equal(feel.takeCues().length, 0);
});

test('a hull hit, by its point in the world or in her frame, splinters her paint and leaves a hole', () => {
  const ships = new Map([[1, brig()]]);
  const feel = new FightFeel(2);
  frame(feel, ships, [{ kind: 'hit', ship: 1, by: 0, zone: 'hull', point: [105, 54, 1.5] }], 0);
  frame(feel, ships, [{ kind: 'hit', ship: 1, at: [-8, -4, 1], part: 'hull' }], 0.1);
  const scars = ships.get(1)?.rig?.harm.scars ?? [];
  assert.equal(scars.length, 2);
  assert.ok(Math.abs((scars[0]?.at[0] ?? 0) - 5) < 1e-9 && Math.abs((scars[0]?.at[1] ?? 0) - 4) < 1e-9);
  const pirateHull = feel.marks(0.15).filter((mark) => mark.colour[0] < 0.2 && !mark.blend);
  assert.ok(pirateHull.length >= 8, "her black paint flies, DFO's ten splinters a ball");
  const ship = ships.get(1) as FeelShip;
  const blots = feel.scars([{ ship, place: { x: 100, y: 50, z: 0, heading: Math.PI / 2, pitch: 0, roll: 0 } }]);
  assert.equal(blots.length, 8, 'each hole a ragged few blots');
  assert.ok(
    blots.some((blot) => blot.colour[0] < 0.1) && blots.some((blot) => blot.colour[0] > 0.5),
    'a dark middle in a pale rim of raw timber, which reads on her black paint',
  );
  const drawnLarger = feel.scars([
    { ship, place: { x: 100, y: 50, z: 0, heading: Math.PI / 2, pitch: 0, roll: 0, scale: 4 } },
  ]);
  assert.ok(Math.abs((drawnLarger[0]?.radius ?? 0) - (blots[0]?.radius ?? 0) * 4) < 1e-9, 'as large as she is drawn');
});

test('a ball through her rig holes the sail it passed, or splinters the spar where there is none', () => {
  const ships = new Map([[1, brig()]]);
  const feel = new FightFeel(3);
  const rig = ships.get(1)?.rig as SailRig;
  const canvas = rig.canvas()[2] ?? new Float32Array(3);
  const middle = (3 * 8 + 4) * 3;
  const through: [number, number, number] = [canvas[middle] ?? 0, canvas[middle + 1] ?? 0, canvas[middle + 2] ?? 0];
  frame(feel, ships, [{ kind: 'hit', ship: 1, at: through, part: 'rig' }], 0);
  assert.equal(rig.harm.holes[2]?.size, 1);
  frame(feel, ships, [{ kind: 'hit', ship: 1, at: [0, 0, 60], part: 'rig' }], 0);
  assert.equal(
    rig.harm.holes.reduce((sum, holes) => sum + holes.size, 0),
    1,
    'far over her canvas a ball only splinters her spars',
  );
});

test('her hurts in the view hole her canvas, strike her colours and sink her before any event says so', () => {
  const ships = new Map([[1, brig('struck', 40)]]);
  const feel = new FightFeel(4);
  frame(feel, ships, [], 0);
  const harm = ships.get(1)?.rig?.harm;
  assert.ok(harm && harm.holes.every((holes) => holes.size > 0));
  assert.equal(harm?.struck(10), 1);
  const sinking = new Map([[1, brig('sinking')]]);
  frame(feel, sinking, [], 5);
  assert.ok(sinking.get(1)?.rig?.harm.sinking);
});

test("the contract's events tear her sails, fell her masts, strike and sink her", () => {
  const ships = new Map([[1, brig()]]);
  const feel = new FightFeel(5);
  const events: FeelEvent[] = [
    { kind: 'SailLost', tick: 0, ship: 1, sail: 3 },
    { kind: 'MastFell', tick: 0, ship: 1, mast: 1 },
    { kind: 'Struck', tick: 0, ship: 1 },
    { kind: 'Sinking', tick: 0, ship: 1 },
  ];
  frame(feel, ships, events, 0);
  const harm = ships.get(1)?.rig?.harm;
  assert.ok(harm?.sailLost(3, 1));
  // The wind blows to the south, off her starboard side as she heads east: what falls goes to starboard.
  assert.equal(harm?.mastFallen(1, 1)?.side, 1);
  assert.ok(harm && harm.struck(1) > 0 && harm.sinking);
  const ship = ships.get(1) as FeelShip;
  assert.equal(FightFeel.afloat(ship, 19), true);
  assert.equal(FightFeel.afloat(ship, 20), false, 'gone under after twenty seconds');
});

test('where she went down the water foams, and her flotsam bobs there until gathered', () => {
  const ships = new Map([[1, brig()]]);
  const feel = new FightFeel(6);
  frame(feel, ships, [{ kind: 'Sinking', tick: 0, ship: 1 }], 0);
  for (let now = 11; now < 14; now += 1 / 30) frame(feel, ships, [], now);
  assert.ok(feel.marks(14).some((mark) => Math.hypot(mark.x - 100, mark.y - 50) < 20 && Math.abs(mark.z) < 0.01));
  const gone = new Map([[1, { ...brig('sunk') }]]);
  for (let now = 14; now < 40; now += 0.5) frame(feel, gone, [], now);
  assert.equal(feel.effects.marks(40).length, 0, 'the foam is gone a while after she is under');
  frame(
    feel,
    ships,
    [
      { kind: 'Flotsam', tick: 0, id: 1, at: [100, 52], kind_of: 'crate' },
      { kind: 'Flotsam', tick: 0, id: 2, at: [98, 49], kind_of: 'barrel' },
      { kind: 'Flotsam', tick: 0, id: 3, at: [101, 47], kind_of: 'chest' },
    ],
    20,
  );
  const shapes = () =>
    feel
      .marks(20)
      .map((mark) => mark.shape)
      .filter((shape) => shape && shape !== 'ball');
  assert.deepEqual(shapes().sort(), ['box', 'chest', 'drum']);
  const bob = (now: number) => feel.flotsam.marks(now)[0]?.z ?? 0;
  assert.notEqual(bob(20), bob(21), 'it rides the swell');
  frame(feel, ships, [{ kind: 'Gathered', tick: 0, id: 2, by: 0 }], 21);
  assert.deepEqual(shapes().sort(), ['box', 'chest']);
});

test("a gun's smoke at the raised view rolls out from her side as far as she is drawn larger", () => {
  const ships = new Map([[1, brig()]]);
  const feel = new FightFeel(7);
  frame(feel, ships, [{ kind: 'muzzle', ship: 1, point: [100, 54, 2], launch: [0, 300, 2] }], 0);
  const [near, far] = [feel.marks(0.05, 1), feel.marks(0.05, 4)];
  const flash = (marks: typeof near) => marks.reduce((best, mark) => (mark.radius > best.radius ? mark : best));
  assert.ok(Math.abs(flash(near).y - 54) < 0.5, "the flash at the gun's mouth");
  assert.ok(Math.abs(flash(far).y - 66) < 2, 'four times as far off her middle at four times her size');
});

test("each of the room's events reaches the feel through the one mapping, kind by kind", () => {
  const ships = new Map([[1, brig()]]);
  const feel = new FightFeel(8);
  const harm = () => ships.get(1)?.rig?.harm;
  const take = (event: Parameters<typeof feelOf>[0], now = 0) => {
    const felt = feelOf(event);
    frame(feel, ships, felt ? [felt] : [], now);
    return felt;
  };
  assert.equal(take({ kind: 'Splash', tick: 1, at: [1, 2] }), null, "a ball's splash comes with its shot's events");
  assert.equal(take({ kind: 'Hit', tick: 1, ship: 1, at: [0, 4, 1], part: 'hull' }), null, 'and its hit');
  take({ kind: 'SailLost', tick: 1, ship: 1, sail: 4 });
  assert.ok(harm()?.sailLost(4, 1));
  take({ kind: 'MastFell', tick: 1, ship: 1, mast: 0 });
  assert.ok(harm()?.isFallen(0));
  take({ kind: 'Struck', tick: 1, ship: 1 });
  assert.ok((harm()?.struck(1) ?? 0) > 0);
  take({ kind: 'Sinking', tick: 1, ship: 1 });
  assert.ok(harm()?.sinking);
  take({ kind: 'Flotsam', tick: 1, id: 4, at: [100, 50], kind_of: 'barrel' });
  assert.equal(feel.flotsam.count, 1);
  take({ kind: 'Gathered', tick: 1, id: 4, by: 0 });
  assert.equal(feel.flotsam.count, 0);
  assert.deepEqual(take({ kind: 'Boarding', tick: 1, ship: 1 }), { kind: 'Boarding', tick: 1, ship: 1 });
});

/** Her own Sloop at (0, 0) heading north, her hull `hull` of 100 and her guns as said. */
function own(more: Partial<FeelShip['vessel']> = {}): FeelShip {
  return {
    vessel: {
      ship: [0, 0, 0, 0],
      pose: [0, 0, 0],
      fires: 0,
      sail: 100,
      max_sail: 100,
      state: 'afloat',
      hull: 100,
      max_hull: 100,
      guns: { left: [0, 0] },
      ...more,
    },
    rig: new SailRig(hullSails(0)),
    hull: 0,
    side: 'player',
  };
}
const kicks = (feel: FightFeel) =>
  feel
    .takeCues()
    .flatMap((cue) => (cue.kick === undefined ? [] : [cue.kick]))
    .map((kick) => Math.round(kick * 100) / 100);
const sounds = (feel: FightFeel) =>
  feel
    .takeCues()
    .filter((cue) => cue.kick === undefined)
    .map((cue) => cue.cue);

test("her own gun kicks the eye and booms; a captain's booms and does not kick", () => {
  const feel = new FightFeel(3);
  const ships = new Map([
    [0, own()],
    [1, brig()],
  ]);
  frame(feel, ships, [{ kind: 'muzzle', ship: 0, point: [0, 2, 2], launch: [0, 300, 0] }], 0);
  assert.deepEqual(sounds(feel), ['ship.cannon']);
  frame(feel, ships, [{ kind: 'muzzle', ship: 0, point: [0, 2, 2], launch: [0, 300, 0] }], 0.1);
  assert.deepEqual(kicks(feel), [1.1]);
  frame(feel, ships, [{ kind: 'muzzle', ship: 1, point: [100, 52, 2], launch: [0, 300, 0] }], 0.2);
  assert.deepEqual(kicks(feel), []);
});

test("a ball striking her is heard and jars her eye, a hole harder; the side it came from is told for DFO's 1.4 s", () => {
  const feel = new FightFeel(4);
  const ships = new Map([[0, own()]]);
  frame(feel, ships, [{ kind: 'hit', ship: 0, at: [0, 2, 1], part: 'hull' }], 0);
  const cues = feel.takeCues();
  assert.ok(cues.some((cue) => cue.cue === 'ship.hit'));
  assert.deepEqual(
    cues.flatMap((cue) => (cue.kick === undefined ? [] : [cue.kick])),
    [1.6],
  );
  assert.equal(feel.blow(0.5), 'starboard');
  assert.equal(feel.blow(1.5), null);
  frame(feel, ships, [{ kind: 'hit', ship: 0, by: 1, zone: 'holed', point: [0, -8, 1] }], 2);
  assert.deepEqual(kicks(feel), [2.5]);
  assert.equal(feel.blow(2.1), 'bow');
});

test('a fall alongside throws its water over her rail and rocks her; one further off does neither', () => {
  const feel = new FightFeel(5);
  const ships = new Map([[0, own()]]);
  frame(feel, ships, [{ kind: 'splash', at: [5, 0] }], 0);
  const cues = feel.takeCues();
  const kick = cues.find((cue) => cue.kick !== undefined)?.kick ?? 0;
  assert.ok(kick > 0.28 && kick <= 0.7, `${kick}`);
  assert.ok(feel.marks(0.6).filter((mark) => mark.x < 4.5 && mark.z > 1).length > 4, 'thrown toward her deck');
  frame(feel, ships, [{ kind: 'splash', at: [40, 0] }], 1);
  assert.deepEqual(kicks(feel), []);
});

test('a ball going by her close whistles once, where it passed; her own going out never does', () => {
  const feel = new FightFeel(6);
  const ships = new Map([[0, own()]]);
  const step = (balls: [number, number, number, number][], now: number) =>
    feel.frame({ events: [], ships, balls, now, seconds: 0.1, windBearing: 0, toWindow: here });
  step([[30, 0, 3, 0.07]], 0);
  step([[12, 0, 3, 0.07]], 0.1);
  step([[6, 0, 3, 0.07]], 0.2);
  step([[0, 0, 9, 0.07]], 0.3);
  assert.deepEqual(sounds(feel), ['ship.whistle']);
  step([[6, 0, 3, 0.07]], 0.4);
  step([[14, 0, 3, 0.07]], 0.5);
  assert.deepEqual(sounds(feel), []);
});

test('her side coming ready is heard and told, as a captain running out is heard', () => {
  const feel = new FightFeel(7);
  const ships = new Map([
    [0, own({ guns: { left: [2, 0] } })],
    [1, brig()],
  ]);
  frame(feel, ships, [], 0);
  ships.set(0, own({ guns: { left: [0, 0] } }));
  const captain = brig();
  ships.set(1, { ...captain, vessel: { ...captain.vessel, run_out: ['port'] } });
  frame(feel, ships, [], 0.1);
  assert.deepEqual(sounds(feel).sort(), ['ship.ready', 'ship.runout']);
  assert.ok(feel.readyAt(0) === 0.1 && feel.readyAt(1) === null);
  for (let tick = 2; tick < 20; tick++) frame(feel, ships, [], tick / 10);
  assert.ok(
    feel.marks(1.95).some((mark) => mark.blend === 'glow' && mark.x > 90),
    'her ports glint',
  );
});

test('a burning ship going down may blow her magazine, decided by her own seed, the same for everyone', () => {
  const blows = (seed: number) => {
    const feel = new FightFeel(seed);
    const ships = new Map([[0, own()]]);
    const brig2 = brig();
    ships.set(2, { ...brig2, vessel: { ...brig2.vessel, ship: [20 + seed, 0, 0, 0], fires: 2 } });
    frame(feel, ships, [{ kind: 'Sinking', ship: 2 }], 0);
    feel.takeCues();
    for (let tick = 1; tick < 60; tick++) frame(feel, ships, [], tick / 10);
    return feel.takeCues().some((cue) => cue.cue === 'ship.blast');
  };
  const seen = Array.from({ length: 24 }, (unused, seed) => blows(seed));
  assert.ok(seen.some(Boolean) && !seen.every(Boolean), 'some blow, some do not');
  assert.equal(blows(5), blows(5));
  const other = new FightFeel(99);
  const ships = new Map([[0, own()]]);
  const brig2 = brig();
  ships.set(2, { ...brig2, vessel: { ...brig2.vessel, ship: [25, 0, 0, 0], fires: 2 } });
  frame(other, ships, [{ kind: 'Sinking', ship: 2 }], 0);
  for (let tick = 1; tick < 60; tick++) frame(other, ships, [], tick / 10);
  assert.equal(
    other.takeCues().some((cue) => cue.cue === 'ship.blast'),
    blows(5),
    "the feel's own seed does not decide it: her own does",
  );
});

test('her hull battered under three fifths, she smokes along her deck; whole, she does not', () => {
  const [hurt, whole] = [new FightFeel(8), new FightFeel(8)];
  for (let tick = 0; tick < 90; tick++) {
    frame(hurt, new Map([[0, own({ hull: 20 })]]), [], tick / 30);
    frame(whole, new Map([[0, own()]]), [], tick / 30);
  }
  const smoke = (feel: FightFeel) => feel.marks(3).filter((mark) => mark.blend === 'smoke').length;
  assert.ok(smoke(hurt) > 3);
  assert.equal(smoke(whole), 0);
});

test('a burning ship lights the hulls round her, three at most', () => {
  const feel = new FightFeel(9);
  const ships = new Map<number, FeelShip>();
  for (let number = 1; number <= 5; number++) {
    const ship = brig();
    ships.set(number, { ...ship, vessel: { ...ship.vessel, ship: [number * 40, 0, 0, 0], fires: 1 } });
  }
  frame(feel, ships, [], 0);
  const lights = feel.marks(0).filter((mark) => mark.blend === 'light' && mark.radius === 16);
  assert.equal(lights.length, 3);
});
