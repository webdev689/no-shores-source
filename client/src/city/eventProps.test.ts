import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Ager,
  eventProps,
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

test('the fissure opens as far as its health says, and once the event is over its scar rises as it closes', () => {
  const opening = eventProps({ phase: PHASE.running, marks: [mark(MARK.fissure, { health: 0.5 })] }, [], aged(0), 0);
  assert.deepEqual(
    opening.map((prop) => [prop.module, prop.rise]),
    [['lattice-fissure', 0.5]],
  );
  const closing = eventProps({ phase: PHASE.won, marks: [mark(MARK.fissure, { health: 0.2 })] }, [], aged(0), 0);
  assert.deepEqual(
    closing.map((prop) => prop.module),
    ['lattice-fissure', 'lattice-fissure-sealed'],
  );
  assert.ok((closing[1]?.rise ?? 0) > 0.8, 'the scar has nearly risen');
  const shut = eventProps({ phase: PHASE.won, marks: [mark(MARK.fissure, { health: 0 })] }, [], aged(0), 0);
  assert.deepEqual(
    shut.map((prop) => [prop.module, prop.rise]),
    [['lattice-fissure-sealed', 1]],
  );
});

test('the growth rises over its time, stands, and is gone once it has sunk', () => {
  const growth = (state: number, seconds: number) =>
    eventProps({ phase: PHASE.running, marks: [mark(MARK.growth, { state })] }, [], aged(seconds), 0);
  assert.equal(growth(GROWTH.rising, MOTION.growthRiseS / 2)[0]?.rise, 0.5);
  assert.equal(growth(GROWTH.standing, 99)[0]?.rise, 1);
  assert.deepEqual(growth(GROWTH.sinking, MOTION.growthSinkS), []);
  assert.ok((growth(GROWTH.broken, 0)[0]?.glow ?? 0) > 2, 'it flares as it shatters');
});

test('a store stands as one of three stacks by its id, and plundered once plundered', () => {
  const store = (id: number, state: number) =>
    eventProps({ phase: PHASE.running, marks: [mark(MARK.store, { id, state })] }, [], aged(0), 0)[0]?.module;
  assert.equal(store(3, STORE.whole), 'tithe-stores-a');
  assert.equal(store(4, STORE.whole), 'tithe-stores-b');
  assert.equal(store(5, STORE.whole), 'tithe-stores-c');
  assert.equal(store(4, STORE.plundered), 'tithe-stores-plundered');
});

test('a carried shard is held at the hand, and a banner is driven in over its time', () => {
  const [carried] = eventProps({ phase: PHASE.running, marks: [mark(MARK.carried)] }, [], aged(0), 0);
  assert.equal(carried?.at[2], 30 + MOTION.handM);
  assert.equal(carried?.scale, MOTION.carriedScale);
  const [banner] = eventProps({ phase: PHASE.running, marks: [mark(MARK.banner)] }, [], aged(0), 0);
  assert.equal(banner?.rise, 0);
});

test("a chest's lid stands at its hinge, shut until opened and then swung open", () => {
  const shut = eventProps(null, [{ id: 1, at: [5, 6, 7], tier: 1, opened: null }], aged(0), 0);
  assert.deepEqual(
    shut.map((prop) => prop.module),
    ['event-chest', 'event-chest-lid'],
  );
  const [body, lid] = shut;
  assert.ok(body && lid);
  assert.deepEqual(lid.at, propPoint(body, moduleSocket(moduleNumber('event-chest'), 'hinge')));
  assert.ok(lid.at[2] > 7.4, 'the hinge is at the top of the chest');
  assert.equal(lid.lid, 0);
  const open = eventProps(null, [{ id: 1, at: [5, 6, 7], tier: 4, opened: 5 }], aged(0), 0);
  assert.deepEqual(
    open.map((prop) => [prop.module, prop.lid]),
    [
      ['event-chest-heroic', 0],
      ['event-chest-heroic-lid', MOTION.lidOpenRad],
    ],
  );
});

test('the state clock ages a mark from when its state began, and forgets a mark no longer drawn', () => {
  const clock = new StateClock();
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
  const fissure = eventProps({ phase: PHASE.running, marks: [mark(MARK.fissure)] }, [], aged(0), 0);
  assert.equal(propLamps(fissure).length, 3);
  assert.equal(propLamps(eventProps(null, [{ id: 1, at: [0, 0, 0], tier: 1, opened: null }], aged(0), 0)).length, 0);
  assert.equal(propLamps(eventProps(null, [{ id: 1, at: [0, 0, 0], tier: 1, opened: 1 }], aged(0), 0)).length, 1);
});
