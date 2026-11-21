import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent, FlyingShot, FromRoomMessage, SeenFoe, SeenPlayer } from './messages.ts';
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
