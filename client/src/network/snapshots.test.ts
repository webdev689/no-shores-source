import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLANCE_FLOATS } from '../rules/fighters.ts';
import {
  type FightEvent,
  type FlyingShot,
  type FromRoomMessage,
  type SeenFoe,
  type SeenPlayer,
  foeOf,
} from './messages.ts';
import { SnapshotKeeper } from './snapshots.ts';

type Snapshot = Extract<FromRoomMessage, { kind: 'snapshot' }>;

const player = (number: number, acknowledged = 0) => ({ player: number, acknowledged }) as unknown as SeenPlayer;
const foe = (id: number, alert = 0) => ({ id, alert }) as unknown as SeenFoe;
const event = (tick: bigint) => ({ tick, kind: 1 }) as unknown as FightEvent;
const ball = (stopped: bigint) => ({ owner: 1, stopped }) as unknown as FlyingShot;
const snapshot = (tick: bigint, more: Partial<Snapshot> = {}): Snapshot =>
  ({
    kind: 'snapshot',
    tick,
    base: 0n,
    gonePlayers: [],
    goneFoes: [],
    players: [],
    foes: [],
    events: [],
    shots: [],
    dressed: [],
    ...more,
  }) as Snapshot;

test('a snapshot built on one held is made whole: what changed over it, what is gone taken out, the rest as it stood', () => {
  const kept = new SnapshotKeeper();
  kept.whole(snapshot(10n, { players: [player(7), player(9)], foes: [foe(1), foe(2), foe(3)] }));
  const whole = kept.whole(
    snapshot(11n, { base: 10n, players: [player(9, 4)], foes: [foe(3, 2)], goneFoes: [1], gonePlayers: [] }),
  );
  assert.deepEqual(
    whole?.players.map((seen) => [seen.player, seen.acknowledged]),
    [
      [7, 0],
      [9, 4],
    ],
  );
  assert.deepEqual(
    whole?.foes.map((seen) => [seen.id, seen.alert]),
    [
      [2, 0],
      [3, 2],
    ],
    'in number order',
  );
  assert.equal(whole?.base, 0n, 'whole now');
});

test('an older snapshot, or one built on a snapshot not held, is passed over; the next whole one is taken', () => {
  const kept = new SnapshotKeeper();
  kept.whole(snapshot(10n, { foes: [foe(1)] }));
  assert.equal(kept.whole(snapshot(9n)), null, 'older');
  assert.equal(kept.whole(snapshot(10n)), null, 'the same again');
  assert.equal(kept.whole(snapshot(12n, { base: 11n })), null, 'built on one never held');
  assert.deepEqual(
    kept.whole(snapshot(13n, { foes: [foe(5)] }))?.foes.map((seen) => seen.id),
    [5],
  );
});

test('what happened comes again until a later snapshot is shown, and is handed on once', () => {
  const kept = new SnapshotKeeper();
  const first = kept.whole(snapshot(10n, { events: [event(10n)], shots: [ball(0n), ball(10n)] }));
  assert.equal(first?.events.length, 1);
  // The page had not yet said it showed 10, so 11 is built on 9's room-side history and carries 10's again.
  const next = kept.whole(snapshot(11n, { events: [event(10n), event(11n)], shots: [ball(0n), ball(10n), ball(11n)] }));
  assert.deepEqual(
    next?.events.map((each) => each.tick),
    [11n],
  );
  assert.deepEqual(
    next?.shots.map((shot) => shot.stopped),
    [0n, 11n],
    'a shot flying always, a stopped ball once',
  );
  kept.clear();
  assert.equal(kept.whole(snapshot(1n, { events: [event(1n)] }))?.events.length, 1, 'a new welcome starts again');
});

test('the player’s own fighter sent as what changed is laid over the one held, and cannot be made without one', () => {
  const kept = new SnapshotKeeper();
  const held = Float64Array.from({ length: 30 }, (_unused, index) => index);
  const own = { player: 9, acknowledged: 1, fighter: held } as unknown as SeenPlayer;
  kept.whole(snapshot(10n, { players: [own] }));
  const changes = { bits: Uint8Array.from([0b0000_0011, 0, 0, 0b0010_0000]), numbers: Float64Array.from([5, 6, 7]) };
  const sent = { player: 9, acknowledged: 2, fighter: null, changes } as unknown as SeenPlayer;
  const whole = kept.whole(snapshot(11n, { base: 10n, players: [sent] }));
  const fighter = whole?.players[0]?.fighter;
  assert.deepEqual([fighter?.[0], fighter?.[1], fighter?.[2], fighter?.[29]], [5, 6, 2, 7]);
  assert.equal(whole?.players[0]?.body.x, 5, 'its body read again from it');
  assert.equal('changes' in (whole?.players[0] ?? {}), false);
  const fresh = new SnapshotKeeper();
  fresh.whole(snapshot(10n));
  assert.equal(fresh.whole(snapshot(11n, { base: 10n, players: [sent] })), null, 'no fighter held to lay them over');
});

test('a foe sent as what changed is laid over the numbers held, a companion still the officer it was', () => {
  const kept = new SnapshotKeeper();
  const numbers = new Float64Array(GLANCE_FLOATS + 17);
  // A swordsman of type 14 at level 4, then last its leader, 9, its officer's names and post, the Lookout.
  numbers.set([2, 14, 3, 0, 1, 2, 4], GLANCE_FLOATS);
  numbers.set([9, 2, 5, 4], GLANCE_FLOATS + 13);
  kept.whole(snapshot(10n, { foes: [foeOf(13, numbers)] }));
  const alertness = GLANCE_FLOATS + 5;
  const bits = new Uint8Array(Math.ceil(numbers.length / 8));
  bits[alertness >> 3] = 1 << (alertness & 7);
  const sent = { ...foeOf(13, new Float64Array(numbers.length)), changes: { bits, numbers: Float64Array.from([3]) } };
  const whole = kept.whole(snapshot(11n, { base: 10n, foes: [sent] }));
  assert.deepEqual([whole?.foes[0]?.alert, whole?.foes[0]?.level], [3, 4]);
  assert.deepEqual(whole?.foes[0]?.companion, { leader: 9, given: 2, family: 5, post: 4 });
});

test('a foe sent as what changed keeps the name it stands under, which crosses each time it does', () => {
  const kept = new SnapshotKeeper();
  const numbers = new Float64Array(GLANCE_FLOATS + 17);
  kept.whole(snapshot(10n, { foes: [{ ...foeOf(6, numbers), name: 'The Warden of the Fissure' }] }));
  const bits = new Uint8Array(Math.ceil(numbers.length / 8));
  bits[0] = 1;
  const changes = { bits, numbers: Float64Array.from([3]) };
  const sent = { ...foeOf(6, new Float64Array(numbers.length)), changes, name: 'The Warden of the Fissure' };
  const whole = kept.whole(snapshot(11n, { base: 10n, foes: [sent] }));
  assert.equal(whole?.foes[0]?.name, 'The Warden of the Fissure');
  const still = kept.whole(snapshot(12n, { base: 11n }));
  assert.equal(still?.foes[0]?.name, 'The Warden of the Fissure', 'and one not sent stands as it stood');
});
