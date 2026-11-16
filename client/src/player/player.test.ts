import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { startMovementRules } from '../rules/movementRules.ts';
import { cardStand, eyeOf } from './figures.ts';
import type { Action, InputFrame } from './input.ts';
import { newPlayer, playerCamera, shownBody, updatePlayer } from './player.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
const moduleBytes = await readFile(MODULE).catch(() => {
  throw new Error('movement_wasm.wasm is not built: run `npm run wasm` first');
});
const movement = await startMovementRules(moduleBytes);
movement.setCourse([]);
const onCourse = await startMovementRules(moduleBytes);
onCourse.setCourse(course.blocks);
const TICK = movement.tickSeconds;

/** A frame with these actions held, and those pressed this frame. */
function frame(held: Action[] = [], pressed: Action[] = [], more: Partial<InputFrame> = {}): InputFrame {
  return {
    held: (action) => held.includes(action) || pressed.includes(action),
    pressed: (action) => pressed.includes(action),
    released: () => false,
    lookX: 0,
    lookY: 0,
    wheel: 0,
    locked: true,
    ...more,
  };
}
const start = () => newPlayer(movement, 0, 0);

test('a right click readies a weapon that is away; swinging turns the figure to the view', () => {
  const readied = updatePlayer(start(), frame([], ['swing']), movement, TICK);
  assert.equal(readied.drawn, true);
  const turned = updatePlayer({ ...readied, yaw: 1, facing: 0 }, frame(), movement, TICK, true);
  assert.equal(turned.facing, 1);
});

test('Z puts the weapon away and readies it; the wheel and Mouse4 move between first and third person', () => {
  const player = start();
  assert.equal(player.view.firstPerson, false);
  assert.equal(updatePlayer(player, frame([], ['ready']), movement, TICK).drawn, true);
  assert.equal(updatePlayer(player, frame([], ['perspective']), movement, TICK).view.firstPerson, true);
  let scrolling = player;
  for (let notch = 0; notch < 20 && !scrolling.view.firstPerson; notch++)
    scrolling = updatePlayer(scrolling, frame([], [], { wheel: -1 }), movement, TICK);
  assert.equal(scrolling.view.firstPerson, true);
});

test('the mouse turns the view; the figure faces where it walks and keeps facing there when still', () => {
  let player = updatePlayer(start(), frame([], [], { lookX: 400 }), movement, TICK);
  assert.ok(Math.abs(player.yaw - 1) < 1e-9);
  player = updatePlayer(player, frame(['left']), movement, TICK);
  const walkingFacing = player.facing;
  player = updatePlayer(player, frame(), movement, TICK);
  assert.equal(player.facing, walkingFacing);
  // Casting turns it to the view.
  player = updatePlayer(player, frame([], ['cast']), movement, TICK);
  assert.equal(player.facing, player.yaw);
});

test('comma mounts and dismounts; mounted, a right click does not ready the weapon', () => {
  const mounted = updatePlayer(start(), frame([], ['mount']), movement, TICK);
  assert.equal(mounted.mounted, true);
  assert.equal(updatePlayer(mounted, frame([], ['swing']), movement, TICK).drawn, false);
});

test('the body moves only in whole ticks, and a jump pressed between ticks is kept for the next', () => {
  const pressed = updatePlayer(start(), frame([], ['jump']), movement, TICK / 4);
  assert.equal(pressed.body.mode, 'ground');
  assert.equal(pressed.queued.jump, true);
  const jumped = updatePlayer(pressed, frame(), movement, TICK);
  assert.equal(jumped.body.mode, 'air');
  assert.equal(jumped.queued.jump, false);
});

test('a crouch pressed in a frame of two ticks toggles once, on the first', () => {
  const crouched = updatePlayer(start(), frame([], ['crouch']), movement, 2 * TICK);
  assert.equal(crouched.body.crouched, true);
  assert.equal(crouched.queued.crouch, false);
});

test('between ticks the body is drawn eased from the tick before toward the last', () => {
  const walked = updatePlayer(start(), frame(['forward']), movement, TICK);
  const halfway = updatePlayer(walked, frame(['forward']), movement, TICK / 2);
  assert.equal(halfway.body, walked.body);
  const shown = shownBody(halfway);
  assert.ok(Math.abs(shown.y - (halfway.previous.y + halfway.body.y) / 2) < 1e-12);
});

test('going over a lip, the body’s centre passes behind the wall’s face, but its card stays in front', () => {
  // The course's ledge: x 0 to 6, its face at y -1, its lip 2.3 m up. The player walks north at it, jumps and goes over.
  const ledge = { face: -1, lip: 2.3 };
  let player = newPlayer(onCourse, 3, 1);
  let [centreBehind, cardBehind, wentOver] = [false, false, false];
  for (let tick = 0; tick < 240; tick++) {
    const atWall = player.body.mode === 'ground' && player.body.y < ledge.face + 0.4;
    player = updatePlayer(player, frame(['forward'], atWall ? ['jump'] : []), onCourse, TICK);
    const body = shownBody(player);
    if (player.body.mode !== 'mantle' || body.z >= ledge.lip) continue;
    wentOver = true;
    const eye = eyeOf(playerCamera(player, onCourse, course.blocks));
    centreBehind ||= body.y < ledge.face;
    cardBehind ||= cardStand(body.x, body.y, eye.x, eye.y).y < ledge.face;
  }
  assert.ok(wentOver, 'the player went over the lip');
  assert.ok(centreBehind, 'the body’s centre passed behind the face below the lip');
  assert.equal(cardBehind, false);
});
