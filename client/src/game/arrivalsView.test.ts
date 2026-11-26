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

test('an airship’s rumble is heard once it comes within a whole sound’s reach, not as it sets out 340 m off', () => {
  const ship: ArrivalSeen = { ...CROWN_SEEN, id: 3, kind: 1, heading: 0, high: 16, gone: 900 };
  const view = new ArrivalsView();
  const eye: readonly [number, number, number] = [0, 30, 2];
  const rumbled: number[] = [];
  for (let tick = ship.began; tick <= ship.hangs; tick++) {
    const frame = view.frame(fightAt(tick, [ship]), tick / 60, [], eye, flat);
    if (frame.sounds.some((sound) => sound.cue === 'amb.thunder.roll')) rumbled.push(tick);
  }
  assert.equal(rumbled.length, 1, `heard at ${rumbled}`);
  assert.ok((rumbled[0] ?? 0) > ship.began, 'not as it sets out');
});

test('the dust a foe throws up landing off its beam stays where it landed as the foe runs off', () => {
  const ship: ArrivalSeen = { ...CROWN_SEEN, id: 4, kind: 1, heading: 0, high: 16, gone: 900 };
  const arrival = { kind: 1, from: 4, drops: 200, lands: 260 };
  const dust = (runs: boolean) => {
    const view = new ArrivalsView();
    let marks: number[] = [];
    for (let tick = 190; tick <= 275; tick++) {
      const off = runs && tick >= arrival.lands ? (tick - arrival.lands) * 0.2 : 0;
      const foes = new Map([[9, { arrival: tick < arrival.lands ? arrival : null, view: { x: off, y: 0, z: 5 } }]]);
      marks = [];
      view.frame({ roomTick: tick, arrivals: [ship], foes }, tick / 60, marks, [0, 30, 2], flat);
    }
    assert.ok(marks.length > 0, 'its dust is laid');
    return marks;
  };
  assert.deepEqual(dust(true), dust(false));
});
