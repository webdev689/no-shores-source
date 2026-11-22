import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { startMovementRules } from '../rules/movementRules.ts';
import {
  countdownText,
  deathWords,
  greyed,
  distanceText,
  placeWords,
  RESPAWN_SECONDS,
  standingOf,
  vignette,
  WARNING_SECONDS,
} from './hudLaw.ts';

test('the warning counts down in whole seconds and stops at 0', () => {
  assert.equal(countdownText(9.2), '10');
  assert.equal(countdownText(0.01), '1');
  assert.equal(countdownText(-3), '0');
});

test('the screen darkens as the count runs out, and stays dark in death', () => {
  assert.equal(vignette({ kind: 'inside' }, 10), 0);
  const early = vignette({ kind: 'warned', secondsLeft: 9 }, 10);
  const late = vignette({ kind: 'warned', secondsLeft: 1 }, 10);
  assert.ok(early > 0 && early < late && late < 0.9, `${early} ${late}`);
  assert.equal(vignette(standingOf('dead', 60), 10), 0.85);
  assert.equal(vignette(standingOf('dead', 60, true, false), 10), 0, 'none while the fall plays');
  assert.equal(vignette(standingOf('dead', 60, true, true), 10), 0.85, 'once it has played');
});

test("a standing's ticks read as seconds, and Respawn is offered after 4 s dead", () => {
  assert.deepEqual(standingOf('inside', 0), { kind: 'inside' });
  assert.deepEqual(standingOf('warned', 540), { kind: 'warned', secondsLeft: 9 });
  const strayed = { fell: false, told: true };
  assert.deepEqual(standingOf('dead', 120), { kind: 'dead', secondsDead: 2, canRespawn: false, ...strayed });
  assert.deepEqual(standingOf('dead', 240), { kind: 'dead', secondsDead: 4, canRespawn: true, ...strayed });
  assert.deepEqual(standingOf('dead', 60, true, false), {
    kind: 'dead',
    secondsDead: 1,
    canRespawn: false,
    fell: true,
    told: false,
  });
  const strayedNow = standingOf('dead', 60, false, false);
  assert.equal(strayedNow.kind === 'dead' && strayedNow.told, true, 'a death by straying is told at once');
});

test('death by a fall reads "You fell."; by straying, that the player strayed', () => {
  assert.equal(deathWords(true), 'You fell.');
  assert.equal(deathWords(false), 'You strayed too far from the area.');
});

test('distances read in metres near and kilometres far', () => {
  assert.equal(distanceText(347), '350 m');
  assert.equal(distanceText(4_260), '4.3 km');
  assert.equal(distanceText(146_000), '146 km');
});

test("the warning's count and the wait to respawn are the reach rules' own, read through the movement door", async () => {
  const module = new URL('../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
  const movement = await startMovementRules(await readFile(module));
  movement.setSection({
    ring: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
    spawns: [[50, 50]],
  });
  let reach = movement.reachTick(movement.standing(110, 50));
  assert.equal(reach.kind === 'warned' && reach.ticksLeft + 1, WARNING_SECONDS * 60);
  let dead = 0;
  while (reach.kind !== 'dead' || reach.ticks < 1) {
    reach = movement.reachTick(movement.standing(110, 50));
    if (reach.kind === 'dead') dead = reach.ticks;
  }
  for (; movement.respawn(110, 50) === null; dead++) reach = movement.reachTick(movement.standing(110, 50));
  const shown = standingOf('dead', dead);
  assert.equal(shown.kind === 'dead' && shown.canRespawn, true, 'Respawn is offered as the rules allow it');
  assert.deepEqual(standingOf('dead', dead - 1), {
    kind: 'dead',
    secondsDead: (dead - 1) / 60,
    canRespawn: false,
    fell: false,
    told: true,
  });
  assert.equal(dead, RESPAWN_SECONDS * 60);
});

test("in a dungeon's room the words under its name start with the room's", () => {
  const dungeon = { kind: 'dungeon', continent: 'continent-1' } as const;
  assert.ok(placeWords(dungeon, 'the Ossuary').startsWith('The Ossuary · Dungeon'));
  assert.ok(placeWords(dungeon, null).startsWith('Dungeon'));
});

test("a place's words name its kind, and its island where the owner has named one", () => {
  assert.equal(placeWords({ kind: 'social', continent: 'continent-1' }), 'Social space · Saltmere');
  assert.equal(placeWords({ kind: 'patrol', continent: 'continent-9' }), 'Patrol');
});

test('the world goes grey only once death is told, so a fall plays out in colour', () => {
  assert.equal(greyed(standingOf('dead', 30, true, false)), false);
  assert.equal(greyed(standingOf('dead', 30, true, true)), true);
  assert.equal(greyed(standingOf('dead', 0, false)), true, 'a death by straying is told at once');
  assert.equal(greyed(standingOf('warned', 300)), false);
});
