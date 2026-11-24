import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Ager,
  eventProps,
  foundChestProps,
  GROWTH,
  MARK,
  MOTION,
  PHASE,
  PROP_MODULES,
  type PublicMarkLike,
  propLamps,
  propPoint,
  StateClock,
  STORE,
} from './eventProps.ts';
import { moduleNumber, moduleSocket } from './modules.ts';

const mark = (kind: number, more: Partial<PublicMarkLike> = {}): PublicMarkLike => ({
  kind,
  id: 7,
  at: [100, 200, 30],
  health: 1,
  state: 1,
  ...more,
});
const aged =
  (seconds: number): Ager =>
  () =>
    seconds;

test('every event prop is a module the manifest names', () => {
  for (const name of PROP_MODULES) assert.ok(moduleNumber(name) >= 0, name);
});

test('the fissure tears open as its event begins, narrows as its health says but never shuts while it runs, and shuts as its scar rises', () => {
  const COUNTDOWN = 8 * 3_600;
  const RESULT = 12 * 60;
  const fissure = (phase: number, health: number, ticksLeft: number) =>
    eventProps({ phase, ticksLeft, marks: [mark(MARK.fissure, { health })] }, [], aged(0), 0).map((prop) => [
      prop.module,
      prop.rise,
      prop.glow,
    ]);
  assert.deepEqual(fissure(PHASE.running, 1, COUNTDOWN), [], 'a line as it begins');
  assert.equal(fissure(PHASE.running, 1, COUNTDOWN - MOTION.fissureOpenS * 30)[0]?.[1], 0.5, 'tearing open');
  assert.equal(fissure(PHASE.running, 0.5, 600)[0]?.[1], 0.5, 'as open as its health, a page come mid-event too');
  assert.equal(fissure(PHASE.running, 0, 600)[0]?.[1], MOTION.fissureLeastOpen, 'never shut while it runs');
  const shutting = fissure(PHASE.won, 0, RESULT - MOTION.fissureShutS * 30);
  assert.deepEqual(
    shutting.map(([module, rise]) => [module, rise]),
    [
      ['lattice-fissure', MOTION.fissureLeastOpen / 2],
      ['lattice-fissure-sealed', 0.5],
    ],
  );
  assert.deepEqual(fissure(PHASE.won, 0, 0), [['lattice-fissure-sealed', 1, 0]], "sealed, the scar's glow died");
  assert.deepEqual(fissure(PHASE.failed, 0, 0), [], 'failed, it closes into plain turf, no scar');
});

test('the growth rises over its time, stands, and is gone once it has sunk', () => {
  const growth = (state: number, seconds: number) =>
    eventProps({ phase: PHASE.running, ticksLeft: 0, marks: [mark(MARK.growth, { state })] }, [], aged(seconds), 0);
  assert.equal(growth(GROWTH.rising, MOTION.growthRiseS / 2)[0]?.rise, 0.5);
  assert.equal(growth(GROWTH.standing, 99)[0]?.rise, 1);
  assert.deepEqual(growth(GROWTH.sinking, MOTION.growthSinkS), []);
  assert.ok((growth(GROWTH.broken, 0)[0]?.glow ?? 0) > 2, 'it flares as it shatters');
});

test('a store stands as one of three stacks by its id, and plundered once plundered', () => {
  const store = (id: number, state: number) =>
    eventProps({ phase: PHASE.running, ticksLeft: 0, marks: [mark(MARK.store, { id, state })] }, [], aged(0), 0)[0]
      ?.module;
  assert.equal(store(3, STORE.whole), 'tithe-stores-a');
  assert.equal(store(4, STORE.whole), 'tithe-stores-b');
  assert.equal(store(5, STORE.whole), 'tithe-stores-c');
  assert.equal(store(4, STORE.plundered), 'tithe-stores-plundered');
});

test('a carried shard is held at the hand, and a banner is driven in over its time', () => {
  const [carried] = eventProps({ phase: PHASE.running, ticksLeft: 0, marks: [mark(MARK.carried)] }, [], aged(0), 0);
  assert.equal(carried?.at[2], 30 + MOTION.handM);
  assert.equal(carried?.scale, MOTION.carriedScale);
  const [banner] = eventProps({ phase: PHASE.running, ticksLeft: 0, marks: [mark(MARK.banner)] }, [], aged(0), 0);
  assert.equal(banner?.rise, 0);
});

test("a chest's lid stands at its hinge, shut until opened and then swung open", () => {
  const shut = eventProps(null, [{ id: 1, at: [5, 6, 7], tier: 1, opened: null }], aged(0), 0);
  assert.deepEqual(
    shut.map((prop) => prop.module),
    ['chest', 'chest-lid'],
  );
  const [body, lid] = shut;
  assert.ok(body && lid);
  assert.deepEqual(lid.at, propPoint(body, moduleSocket(moduleNumber('chest'), 'hinge')));
  assert.ok(lid.at[2] > 7.35 && lid.at[1] < 6, "the hinge is at the top of the chest's back");
  assert.equal(lid.lid, 0);
  const open = eventProps(null, [{ id: 1, at: [5, 6, 7], tier: 4, opened: 5 }], aged(0), 0);
  assert.deepEqual(
    open.map((prop) => [prop.module, prop.lid]),
    [
      ['chest-heroic', 0],
      ['chest-heroic-lid', MOTION.lidOpenRad],
    ],
  );
});

test("a patrol's chest looks the way its place faces, its hinge behind it", () => {
  for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const [body, lid] = foundChestProps({ at: [10, 20, 0], facing, opened: null });
    assert.ok(body && lid);
    const front = propPoint(body, [0, 1, 0]);
    assert.ok(Math.abs(front[0] - 10 - Math.sin(facing)) < 1e-9, `east at ${facing}`);
    assert.ok(Math.abs(front[1] - 20 + Math.cos(facing)) < 1e-9, `south at ${facing}`);
    const back = [lid.at[0] - 10, lid.at[1] - 20];
    assert.ok(back[0] * Math.sin(facing) - (back[1] ?? 0) * Math.cos(facing) < 0, 'its hinge behind it');
  }
});

test('the state clock ages a mark from when its state began, and forgets a mark no longer drawn', () => {
  const clock = new StateClock();
  clock.ager(9)(MARK.banner, 7, 1);
  clock.done();
  assert.equal(clock.ager(10)(MARK.growth, 1, GROWTH.rising), 0);
  clock.done();
  assert.equal(clock.ager(12)(MARK.growth, 1, GROWTH.rising), 2);
  clock.done();
  assert.equal(clock.ager(13)(MARK.growth, 1, GROWTH.standing), 0, 'a new state starts again');
  clock.done();
  clock.done();
  assert.equal(clock.ager(20)(MARK.growth, 1, GROWTH.standing), 0, 'forgotten once not drawn');
});

test('the crystal lights lamps along the fissure, and a chest only once open', () => {
  const fissure = eventProps({ phase: PHASE.running, ticksLeft: 0, marks: [mark(MARK.fissure)] }, [], aged(99), 0);
  assert.equal(propLamps(fissure).length, 4);
  assert.equal(propLamps(eventProps(null, [{ id: 1, at: [0, 0, 0], tier: 1, opened: null }], aged(0), 0)).length, 0);
  assert.equal(propLamps(eventProps(null, [{ id: 1, at: [0, 0, 0], tier: 1, opened: 1 }], aged(0), 0)).length, 1);
});

test('marks already there on the first frame with any are fully aged: a late joiner sees no beat replayed', () => {
  const clock = new StateClock();
  clock.ager(0);
  clock.done();
  const first = clock.ager(100);
  const marks = [
    { kind: MARK.growth, id: 1, at: [0, 0, 0] as const, health: 0, state: GROWTH.broken },
    { kind: MARK.banner, id: 2, at: [4, 0, 0] as const, health: 1, state: 1 },
  ];
  const props = eventProps({ phase: PHASE.running, ticksLeft: 0, marks }, [], first, 100);
  clock.done();
  assert.equal(props.filter((prop) => prop.module === 'lattice-growth').length, 0, 'a broken growth stays gone');
  assert.equal(props.find((prop) => prop.module === 'tithe-banner')?.rise, 1, 'a banner stands driven in');
  assert.equal(clock.ager(101)(MARK.banner, 3, 1), 0, 'one that comes later is driven in from then');
});

test("a shard's spin is wrapped to a turn, however long the page has run", () => {
  const shard = { kind: MARK.shard, id: 4, at: [0, 0, 0] as const, health: 1, state: 1 };
  const [prop] = eventProps({ phase: PHASE.running, ticksLeft: 0, marks: [shard] }, [], () => 0, 1e6);
  assert.ok(prop && prop.turn >= 0 && prop.turn < 2 * Math.PI);
});

test('a beat flares the fissure, its width eases as the page says, and a raid won topples its banners', () => {
  const marks = [mark(MARK.fissure, { health: 1 }), mark(MARK.banner, { id: 3 })];
  const drawn = (phase: number, moments: Parameters<typeof eventProps>[4]) =>
    eventProps({ phase, ticksLeft: 0, marks }, [], aged(99), 0, moments);
  const plain = drawn(PHASE.running, undefined);
  const flared = drawn(PHASE.running, { flare: 1, open: 0.6, topple: 0 });
  const [fissure, flaring] = [plain[0], flared[0]];
  assert.ok(fissure && flaring && flaring.glow > fissure.glow, 'flared');
  assert.equal(flaring?.rise, 0.6, 'as open as the page eases it');
  const toppled = drawn(PHASE.won, { flare: 0, open: null, topple: 1 }).find((prop) => prop.module === 'tithe-banner');
  assert.equal(toppled?.lid, Math.PI / 2, 'fallen flat');
  const banners = plain.filter((prop) => prop.module === 'tithe-banner');
  assert.equal(propLamps(banners).length, 1, 'a warm lamp at the banner');
});

test('the fissure, its scar and the stores stand square to the grid, as the room stands them', () => {
  const marks = [mark(MARK.fissure, { id: 4 }), mark(MARK.store, { id: 9 })];
  const running = eventProps({ phase: PHASE.running, ticksLeft: 0, marks }, [], aged(99), 0);
  const sealed = eventProps({ phase: PHASE.won, ticksLeft: 0, marks }, [], aged(99), 0);
  for (const prop of [...running, ...sealed]) assert.equal(prop.turn, 0, prop.module);
});

test("a banner's warm lamp hangs at its head, under the pole's top", () => {
  const [banner] = eventProps({ phase: PHASE.running, ticksLeft: 0, marks: [mark(MARK.banner)] }, [], aged(99), 0);
  const [lamp] = propLamps(banner ? [banner] : []);
  assert.ok(lamp && lamp.at[2] - (banner?.at[2] ?? 0) > 4.5, `at ${lamp?.at[2]}`);
});
