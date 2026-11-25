import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArrivalSeen } from '../network/arrivalMessages.ts';
import { CROWN } from '../combat/crownLife.ts';
import { type ArrivalsFight, ArrivalsView } from './arrivalsView.ts';

const CROWN_SEEN: ArrivalSeen = {
  id: 2,
  kind: 2,
  at: [0, 0, 5],
  heading: 1,
  high: 0,
  began: 100,
  hangs: 172,
  leaves: 300,
  gone: 348,
};
const NONE = new Map();
const fightAt = (roomTick: number, arrivals: readonly ArrivalSeen[] = [CROWN_SEEN]): ArrivalsFight => ({
  roomTick,
  arrivals,
  foes: NONE,
});
const flat = () => 0;

/** The view stepped a frame at a time from room tick `from` to `to`, a tick a frame; every sound heard. */
function play(view: ArrivalsView, from: number, to: number, ground: (x: number, y: number) => number | null = flat) {
  const heard: string[] = [];
  const shards: (readonly [number, number, number])[] = [];
  for (let tick = from; tick <= to; tick++) {
    const frame = view.frame(fightAt(tick), tick / 60, [], [0, 30, 2], ground);
    heard.push(...frame.sounds.map((sound) => sound.cue));
    shards.push(...frame.props.filter((prop) => prop.module === 'lattice-shard').map((prop) => prop.at));
  }
  return { heard, shards };
}

test('a crown seen from its start is heard forming and breaking', () => {
  const { heard } = play(new ArrivalsView(), 100, 340);
  assert.ok(heard.includes('amb.ice.ping') && heard.includes('shield.break'), `${heard}`);
});

test('a crown first seen long after it formed is not heard forming, nor one first seen broken heard breaking', () => {
  const late = play(new ArrivalsView(), 250, 290).heard;
  assert.ok(!late.includes('amb.ice.ping'), `${late}`);
  const broken = play(new ArrivalsView(), CROWN_SEEN.leaves + CROWN.crackTicks + 40, 345);
  assert.deepEqual(broken.heard, []);
  assert.deepEqual(broken.shards, [], 'nor its shards flung');
});

test('a room joined anew, its numbers starting again, is heard afresh', () => {
  const view = new ArrivalsView();
  play(view, 100, 200);
  const again = view.frame(fightAt(110), 10, [], [0, 30, 2], flat);
  assert.ok(
    again.sounds.some((sound) => sound.cue === 'amb.ice.ping'),
    'its crown 2 is another crown',
  );
});

test('a broken crown’s shards come to rest on the land under each, sloping or not', () => {
  const sloped = (x: number) => 1 + x * 0.5;
  const view = new ArrivalsView();
  play(view, 100, 439, sloped);
  // Two seconds past its break: every shard has struck the land, and none has sunk yet.
  const lying = view.frame(fightAt(440), 440 / 60, [], [0, 30, 2], sloped).props;
  assert.equal(lying.length, 7, 'its seven shards');
  for (const { at } of lying) assert.ok(Math.abs(at[2] - sloped(at[0])) < 1e-9, `${at} on the land`);
});
