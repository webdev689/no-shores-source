import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Glide, type Place } from './glide.ts';

/** Draws a figure walking 0.05 m a tick east, its snapshots at `snapshotTicks` (each its tick), at `perTick` frames a
 *  tick: the place drawn on each frame. */
function drawn(snapshotTicks: readonly number[], perTick: number): number[] {
  const glide = new Glide([0, 0, 0], 0);
  const places: number[] = [];
  let next = 0;
  let seen = 0;
  const last = snapshotTicks.at(-1) ?? 0;
  for (let frame = 0; frame <= last * perTick; frame += 1) {
    const now = frame / perTick;
    // A snapshot is taken by the first frame at or after its arrival.
    while (next < snapshotTicks.length && (snapshotTicks[next] ?? 0) <= now) {
      seen = Math.round(((snapshotTicks[next] ?? 0) + next) / 2);
      next += 1;
    }
    const place: Place = glide.follow([seen * 0.05, 0, 0], seen, 1 / perTick);
    places.push(place[0]);
  }
  return places;
}

const steps = (places: readonly number[]) => places.slice(1).map((place, index) => place - (places[index] ?? 0));

test('a figure snapshotted every third tick glides on every frame, at 144 frames a second, never backward', () => {
  const glide = new Glide([0, 0, 0], 0);
  const places: number[] = [];
  for (let frame = 1; frame <= 144; frame += 1) {
    const tick = Math.floor((frame * 60) / 144 / 3) * 3;
    places.push(glide.follow([tick * 0.05, 0, 0], tick, 60 / 144)[0]);
  }
  const moved = steps(places);
  assert.ok(Math.min(...moved) >= 0, 'never backward');
  // A snapshot taken a frame early starts its glide short of the last place: a little quicker, never a jump.
  assert.ok(Math.max(...moved) <= 0.05 * (60 / 144) * 1.1, `about the walk's own pace: ${Math.max(...moved)}`);
  assert.ok(moved.filter((step) => step > 0).length > 130, 'moving on almost every frame');
});

test('snapshots come late and early: the figure never jumps further than its pace allows', () => {
  const arrivals = [1, 2, 6, 6.2, 6.4, 7, 8, 13, 13.1, 14, 15, 16];
  const moved = steps(drawn(arrivals, 2));
  assert.ok(Math.min(...moved) >= 0);
  // Gliding at most three ticks' walk over a frame of half a tick.
  assert.ok(Math.max(...moved) < 0.05 * 3, `largest step ${Math.max(...moved)}`);
});
