import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type Controls, startMovementRules } from '../rules/movementRules.ts';
import type { Cards } from './cards.ts';
import { plainDress } from './dressing.ts';
import { overProgress } from './fightMoves.ts';
import { newPlayer } from './player.ts';
import { FULL_WALK } from './playerMoves.ts';
import { Walker } from './walker.ts';

// The numbers the figures' moves are reckoned by, held to the movement rules' own.

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
const rules = await startMovementRules(
  await readFile(MODULE).catch(() => {
    throw new Error('movement_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const FORWARD: Controls = { forward: 1, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };

test('the full walk the walk’s frames are drawn for is the movement rules’ walk', () => {
  rules.setCourse([]);
  const body = rules.step(rules.standing(0, 0), FORWARD);
  assert.ok(Math.abs(Math.hypot(body.vx, body.vy) - FULL_WALK) < 1e-12, `the rules walk ${body.vx}, ${body.vy}`);
});

test('a mantle’s or vault’s progress, from the time since it began and the height risen, keeps to the rules’', () => {
  // Thin walls vaulted, deep blocks mantled, from the ground; a ledge out of reach caught on a jump and mantled.
  const walls = [
    [0.6, 0.3],
    [1.2, 0.3],
    [0.8, 3],
    [1.8, 3],
    [2.3, 3],
  ] as const;
  for (const [top, depth] of walls) {
    rules.setCourse([{ minX: -5, minY: -1 - depth, maxX: 5, maxY: -1, top }]);
    let body = rules.standing(0, -0.64);
    let began: { tick: number; z: number } | null = null;
    let highest = 0;
    let worst = 0;
    for (let tick = 0; tick < 200 && !(began && body.mode === 'ground'); tick++) {
      body = rules.step(body, { ...FORWARD, jump: tick === 0 });
      if (body.mode !== 'mantle' && body.mode !== 'vault') continue;
      began ??= { tick, z: body.z };
      highest = Math.max(highest, body.z - began.z);
      const seconds = (tick - began.tick) * rules.tickSeconds;
      const shown = overProgress(body.mode, seconds, body.z - began.z, highest);
      worst = Math.max(worst, Math.abs(shown - (body.over?.progress ?? 0)));
    }
    assert.ok(began, `a wall ${top} m high is gone over`);
    // A mantle's is exact; a vault's runs a little ahead until its arc's top.
    assert.ok(worst < (depth < 1 ? 0.08 : 1e-9), `a wall ${top} m high, ${depth} m deep: off by ${worst}`);
  }
});

test('the player’s figure sliding along a wall steps as slowly as it goes, never jumping a frame', () => {
  // A wall too tall to step onto and too low to climb, so pressing into it off square slides along it.
  rules.setCourse([{ minX: -50, minY: -5, maxX: 50, maxY: -1, top: 1.5 }]);
  const hands = { swing: null, muzzle: null, cancel: () => undefined, update: () => undefined };
  const forge = { frames: () => 4, draws: () => true, warm: () => undefined, pump: () => undefined, card: () => null };
  const dress = plainDress('human', 0.3);
  const you = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  // A full walk along the wall for 0.75 s, then half a radian off it into it: along it at under half a full walk.
  const player = { ...newPlayer(rules, 0, -0.64), yaw: Math.PI / 2 };
  const firstPerson = hands as unknown as ConstructorParameters<typeof Walker>[2];
  const walker = new Walker(player, you, firstPerson, forge as unknown as Cards);
  const forward = { held: (action: string) => action === 'forward', pressed: () => false, released: () => false };
  const input = { ...forward, lookX: 0, lookY: 0, wheel: 0, locked: true };
  const frames: number[] = [];
  for (let step = 1; step <= 165; step++) {
    if (step === 46) walker.player = { ...walker.player, yaw: 0.5 };
    walker.frame(input, rules, rules.tickSeconds, step * rules.tickSeconds);
    frames.push(walker.look.frame);
  }
  const along = (walker.player.body.x - FULL_WALK * 0.75) / 2;
  assert.ok(along > 2 && along < 2.2, `along the wall at ${along} m/s`);
  const last = (index: number) => frames[index - 1] ?? 0;
  const steady = frames.every(
    (frame, index) => index === 0 || frame === last(index) || frame === (last(index) + 1) % 4,
  );
  assert.ok(steady, `no frame jumped: ${frames.join(' ')}`);
  const sliding = frames.slice(45).filter((frame, index) => index > 0 && frame !== last(45 + index));
  assert.equal(sliding.length, 3, 'two seconds at 2.1 m/s step 3.8 frames, where a full walk steps 8');
});
