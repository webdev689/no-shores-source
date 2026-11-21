import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT } from '../combat/cues.ts';
import { ASKS, DROPPED, type GearAsk, type GearDrop } from '../network/gearMessages.ts';
import { MARK, PUBLIC_KIND, type PublicEvent } from '../network/publicMessages.ts';
import { type PublicBodies, PublicView } from './publicView.ts';

const raid = (marks: PublicEvent['marks'], phase = 1): PublicEvent => ({
  kind: PUBLIC_KIND.raid,
  phase,
  ground: [50, 50, 2],
  radius: 30,
  ticksLeft: 3600,
  nextKind: 1,
  nextGround: [0, 0, 0],
  nextTicks: 0,
  stage: 1,
  stages: 3,
  progress: 1000,
  needed: 1000,
  heroic: 0,
  heroicTicks: 0,
  bonus: true,
  marks,
});
const bodies = (more: Partial<PublicBodies> = {}): PublicBodies => ({
  player: 1,
  shot: { eye: [0, 4, 3], yaw: 0, pitch: 0 },
  firstPerson: false,
  feet: [0, 0, 0],
  yaw: 0,
  others: new Map([[2, { x: 10, y: 10, z: 1, facing: Math.PI / 2 }]]),
  where: () => null,
  ...more,
});
const happened = (kind: number, striker = 0, defender = 0) => ({
  tick: 1n,
  kind,
  how: 0,
  striker,
  defender,
  amount: 0,
  stroke: 0,
});
const chest = (id: number, spot: readonly [number, number, number], tier = 3): GearDrop =>
  ({ id, kind: DROPPED.chest, at: spot, from: spot, flying: 0, tier, rarity: 0, slot: 0 }) as unknown as GearDrop;

test('a carried shard is held at its carrier’s off hand: theirs as drawn, the player’s own low in a first-person view', () => {
  const view = new PublicView('saltgrass-downs');
  const carried = (id: number) => ({ kind: MARK.carried, id, at: [99, 99, 99] as const, health: 1, state: 0 });
  const event = { ...raid([carried(1), carried(2)]), kind: PUBLIC_KIND.fissure };
  const shards = (frame: ReturnType<PublicView['frame']>) =>
    frame.props.filter((prop) => prop.module === 'lattice-shard').map((prop) => prop.at);
  const [own, theirs] = shards(view.frame(event, [], [], bodies(), 0, [], () => 0));
  // Facing north, the off (left) hand is to the west; the other faces east, so theirs is to the north.
  assert.ok(own && own[0] < 0 && Math.abs(own[1] + 0.16) < 1e-9, `own: ${own}`);
  assert.ok(theirs && theirs[1] < 10 && Math.abs(theirs[0] - 10.16) < 1e-9, `theirs: ${theirs}`);
  const first = bodies({ shot: { eye: [0, 0, 1.6], yaw: 0, pitch: 0 }, firstPerson: true });
  const [held] = shards(view.frame(event, [], [], first, 0, [], () => 0));
  // Drawn just under the eye, ahead and to the left.
  assert.ok(held && held[1] < -0.5 && held[0] < 0 && held[2] < 1.6 && held[2] > 1, `held: ${held}`);
});

test('a raid’s stores carry their bars while it runs; a plundered store is heard where it stands', () => {
  const view = new PublicView('saltgrass-downs');
  const store = (id: number, health: number) => ({
    kind: MARK.store,
    id,
    at: [id * 5, 0, 1] as const,
    health,
    state: 1,
  });
  const frame = view.frame(
    raid([store(1, 1), store(2, 0.4)]),
    [happened(EVENT.storePlundered, 7, 2)],
    [],
    bodies(),
    0,
    [],
    () => 0,
  );
  assert.deepEqual(frame.shown?.stores, [
    { at: [5, 0, 1], share: 1 },
    { at: [10, 0, 1], share: 0.4 },
  ]);
  assert.deepEqual(frame.sounds, [{ cue: 'sea.ship.break', at: [10, 0, 1] }]);
  const over = view.frame(raid([store(1, 1)], 2), [happened(EVENT.publicWon)], [], bodies(), 0, [], () => 0);
  assert.deepEqual(over.shown?.stores, [], 'no bars once it is over');
  assert.equal(over.sting, 'victory');
  assert.equal(over.shown?.beat, 'won');
});

test('the ring at the ground’s edge is laid on the land while the event runs, and nothing between events', () => {
  const view = new PublicView('saltgrass-downs');
  const laid: number[] = [];
  view.frame(raid([]), [], [], bodies(), 0, laid, (x) => x / 10);
  assert.ok(laid.length > 0);
  const heights = new Set<number>();
  for (let index = 2; index < laid.length; index += 7) heights.add(Math.round((laid[index] ?? 0) * 100));
  assert.ok(heights.size > 10, 'each arc on the land under it');
  const quiet: number[] = [];
  view.frame(raid([], 0), [], [], bodies(), 0, quiet, () => 0);
  assert.equal(quiet.length, 0);
});

test('the land under the ring is read once for its ground, and again only after a while', () => {
  const view = new PublicView('saltgrass-downs');
  let reads = 0;
  const floor = () => {
    reads += 1;
    return 0;
  };
  view.frame(raid([]), [], [], bodies(), 0, [], floor);
  const once = reads;
  assert.ok(once > 0);
  view.frame(raid([]), [], [], bodies(), 1, [], floor);
  assert.equal(reads, once, 'a second frame reads no land');
  view.frame(raid([]), [], [], bodies(), 10, [], floor);
  assert.equal(reads, 2 * once, 'read again after a while');
});

test('E opens the chest in reach, once; it stands open a while after the room has taken it', () => {
  const view = new PublicView('saltgrass-downs');
  const asked: GearAsk[] = [];
  assert.equal(
    view.use([chest(4, [10, 0, 0])], [0, 0, 0], (ask) => asked.push(ask), 0),
    null,
    'out of reach',
  );
  const lying = [chest(4, [1, 1, 0])];
  const use = view.use(lying, [0, 0, 0], (ask) => asked.push(ask), 5);
  assert.equal(use?.words, 'Open the heroic chest');
  use?.run();
  use?.run();
  assert.deepEqual(asked, [{ kind: ASKS.openChest, item: 4 }]);
  const lids = (drops: readonly GearDrop[], clock: number) =>
    view.frame(raid([]), [], drops, bodies(), clock, [], () => 0).props.filter((prop) => prop.module.endsWith('-lid'));
  assert.ok((lids(lying, 5.3)[0]?.lid ?? 0) > 0, 'its lid swings up');
  assert.equal(lids([], 8).length, 1, 'taken off the ground, it still stands open');
  assert.equal(lids([], 12).length, 0, 'and then it is gone');
});

test('a chest the room refuses closes again, and E asks again', () => {
  const view = new PublicView('saltgrass-downs');
  const asked: GearAsk[] = [];
  const lying = [chest(5, [1, 0, 0], 1)];
  view.use(lying, [0, 0, 0], (ask) => asked.push(ask), 0)?.run();
  const lid = (clock: number) =>
    view
      .frame(raid([]), [], lying, bodies(), clock, [], () => 0)
      .props.find((prop) => prop.module === 'event-chest-lid');
  assert.ok((lid(0.5)?.lid ?? 0) > 0, 'swinging while the room is asked');
  assert.ok((lid(3)?.lid ?? 0) > 0, 'held open while the room is slow to take it');
  assert.equal(
    view.use(lying, [0, 0, 0], (ask) => asked.push(ask), 3),
    null,
    'nothing to ask of one asked',
  );
  assert.equal(lid(7)?.lid, 0, 'still lying once the wait is over: refused, closed');
  view.use(lying, [0, 0, 0], (ask) => asked.push(ask), 7)?.run();
  assert.equal(asked.length, 2);
});

test('E passes over a chest already asked to the next in reach', () => {
  const view = new PublicView('saltgrass-downs');
  const asked: GearAsk[] = [];
  const lying = [chest(5, [1, 0, 0], 1), chest(6, [0, 1, 0], 1)];
  view.use(lying, [0, 0, 0], (ask) => asked.push(ask), 0)?.run();
  view.use(lying, [0, 0, 0], (ask) => asked.push(ask), 0.1)?.run();
  assert.deepEqual(
    asked.map((ask) => ask.item),
    [5, 6],
  );
});

const fissure = (marks: PublicEvent['marks']): PublicEvent => ({ ...raid(marks), kind: PUBLIC_KIND.fissure });

test('the heroic task met is heard where the growth or the tithe-taker stood', () => {
  const growth = { kind: MARK.growth, id: 9, at: [5, 6, 1] as const, health: 0, state: 4 };
  const view = new PublicView('saltgrass-downs');
  view.frame(fissure([growth]), [], [], bodies(), 0, [], () => 0);
  const heard = view.frame(fissure([growth]), [happened(EVENT.heroicMet, 1, 9)], [], bodies(), 0.1, [], () => 0);
  assert.deepEqual(heard.sounds, [{ cue: 'shield.break', at: [5, 6, 1] }]);
  const taker = { kind: MARK.titheTaker, id: 9, at: [7, 8, 2] as const, health: 0, state: 3 };
  const raided = new PublicView('saltgrass-downs');
  raided.frame(raid([taker]), [], [], bodies(), 0, [], () => 0);
  const killed = raided.frame(raid([taker]), [happened(EVENT.heroicMet, 1, 9)], [], bodies(), 0.1, [], () => 0);
  assert.deepEqual(killed.sounds, [{ cue: 'kill', at: [7, 8, 2] }]);
});

test('beats kept while the tab was hidden: the last shows, their sounds and stings are dropped', () => {
  const view = new PublicView('saltgrass-downs');
  view.frame(fissure([]), [], [], bodies(), 0, [], () => 0);
  const back = view.frame(
    fissure([]),
    [happened(EVENT.publicBegun), happened(EVENT.shardSet), happened(EVENT.publicWon)],
    [],
    bodies(),
    40,
    [],
    () => 0,
  );
  assert.equal(back.shown?.beat, 'won');
  assert.deepEqual(back.sounds, []);
  assert.equal(back.sting, null);
  const next = view.frame(fissure([]), [happened(EVENT.shardSet)], [], bodies(), 40.02, [], () => 0);
  assert.equal(next.sounds.length, 1, 'heard again once frames run');
});

test('with no event (its room lost) no chest is drawn, and E opens none', () => {
  const view = new PublicView('saltgrass-downs');
  const lying = [chest(5, [1, 0, 0], 1)];
  assert.equal(view.frame(null, [], lying, bodies(), 0, [], () => 0).props.length, 0);
  assert.equal(
    view.use(lying, [0, 0, 0], () => undefined, 0),
    null,
  );
});
