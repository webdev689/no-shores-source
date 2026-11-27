import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { startMovementRules } from '../rules/movementRules.ts';
import {
  countdownText,
  deathWords,
  greyed,
  placeWords,
  RESPAWN_SECONDS,
  standingOf,
  vignette,
  WARNING_SECONDS,
} from './hudLaw.ts';
import { distanceText } from '../plus/compass.ts';

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
  const dead = (secondsDead: number, canRespawn: boolean, respawnIn: number) =>
    ({ kind: 'dead', secondsDead, canRespawn, respawnIn, ...strayed }) as const;
  assert.deepEqual(standingOf('dead', 120), dead(2, false, 2));
  assert.deepEqual(standingOf('dead', 240), dead(4, true, 0));
  assert.deepEqual(standingOf('dead', 60, true, false), {
    kind: 'dead',
    secondsDead: 1,
    canRespawn: false,
    respawnIn: 3,
    fell: true,
    told: false,
  });
  const strayedNow = standingOf('dead', 60, false, false);
  assert.equal(strayedNow.kind === 'dead' && strayedNow.told, true, 'a death by straying is told at once');
});

test('where a place stands its falls again later, or never, Respawn waits for it', () => {
  const respawns = (ticks: number, after: number | null) => {
    const standing = standingOf('dead', ticks, true, true, after);
    return standing.kind === 'dead' && standing.canRespawn;
  };
  assert.deepEqual([respawns(359, 360), respawns(360, 360), respawns(600, 600)], [false, true, true]);
  assert.equal(respawns(100_000, null), false, "never, where the room never takes it (Hard, an encounter's)");
  const waits = standingOf('dead', 60, true, true, null);
  assert.equal(waits.kind === 'dead' && waits.waits, true, 'it says so, so nothing offers Respawn');
  assert.equal('waits' in standingOf('dead', 60, true, true, 600), false);
});

test("where the place stands the fallen again itself, the death's words say when", () => {
  assert.equal(deathWords(true, true), 'You fell. You stand again once the encounter is won or your company falls.');
});

test('death by a fall reads "You fell."; by straying, that the player strayed', () => {
  assert.equal(deathWords(true), 'You fell.');
  assert.equal(deathWords(false), 'You strayed too far from the area.');
});

test('until Respawn may be pressed, the death words count the seconds left, as a death in the fight does', () => {
  const fell = standingOf('dead', 90, true, true, 6 * 60);
  assert.ok(fell.kind === 'dead');
  assert.equal(fell.respawnIn, 5);
  assert.equal(deathWords(fell.fell, fell.waits, fell.respawnIn), 'You fell. Respawn in 5 s');
  const strayed = standingOf('dead', 4 * 60);
  assert.ok(strayed.kind === 'dead' && strayed.canRespawn && strayed.respawnIn === 0);
  assert.equal(deathWords(strayed.fell, strayed.waits, strayed.respawnIn), 'You strayed too far from the area.');
  const waits = standingOf('dead', 90, true, true, null);
  assert.ok(waits.kind === 'dead' && waits.respawnIn === 0);
});

test('distances read in metres near and kilometres far', () => {
  assert.equal(distanceText(347), '350 m');
  assert.equal(distanceText(4_260), '4.3 km');
  assert.equal(distanceText(146_000), '146 km');
  assert.equal(distanceText(996), '1.0 km', 'rounded before its unit is chosen');
  assert.equal(distanceText(19_960), '20 km');
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
    respawnIn: 1,
    fell: false,
    told: true,
  });
  assert.equal(dead, RESPAWN_SECONDS * 60);
});

test("in a dungeon's room the words under its name start with the room's", () => {
  const dungeon = { kind: 'dungeon', continent: 'continent-1' } as const;
  assert.ok(placeWords(dungeon, 'the Ossuary').startsWith('The Ossuary · Dungeon'));
  assert.ok(placeWords(dungeon, null).startsWith('Dungeon'));
  const zone = { ...dungeon, id: 'passage-continent-1-w2900-z7', kind: 'patrol' as const, continent: 'continent-1' };
  assert.equal(placeWords(zone, 'the Ossuary'), 'Passage · Saltmere', 'a passage zone, under ground or above');
});

test('in an Abyss run the words under its name end with the revives its company has left', () => {
  const dungeon = { kind: 'dungeon', continent: 'continent-1' } as const;
  assert.equal(placeWords(dungeon, 'the Ossuary', 3), `${placeWords(dungeon, 'the Ossuary')} · 3 revives left`);
  assert.ok(placeWords(dungeon, null, 1).endsWith(' · 1 revive left'));
  assert.ok(placeWords(dungeon, null, 0).endsWith(' · No revives left'));
  assert.ok(placeWords(dungeon, null, 0, true).endsWith(' · No revives left · Darkness zone'), 'no respawn here');
  assert.ok(placeWords(dungeon, 'the Court', -1, true).endsWith(' · Darkness zone'));
  assert.equal(placeWords(dungeon, null, -1), placeWords(dungeon, null), 'none counted outside Abyss');
});

test("a place's words name its kind, and its island where the owner has named one", () => {
  assert.equal(placeWords({ kind: 'social', continent: 'continent-1' }), 'Social space · Saltmere');
  assert.equal(placeWords({ kind: 'patrol', continent: 'continent-9' }), 'Patrol');
});

test('the world goes grey as the player dies, a fall as a death in a fight, before its death is told', () => {
  assert.equal(greyed(standingOf('dead', 30, true, false)), true, 'a fall still playing');
  assert.equal(greyed(standingOf('dead', 30, true, true)), true);
  assert.equal(greyed(standingOf('dead', 0, false)), true, 'a death by straying');
  assert.equal(greyed(standingOf('warned', 300)), false);
  assert.equal(greyed(standingOf('inside', 0)), false);
});
