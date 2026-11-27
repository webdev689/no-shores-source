import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { startMovementRules } from '../rules/movementRules.ts';
import { cardStand, eyeOf } from './figures.ts';
import type { Action, InputFrame } from './input.ts';
import { newPlayer, playerCamera, shownBody, updatePlayer, withBlocks } from './player.ts';

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

test('locked on, a figure on foot faces its foe as it walks away from it; mounted it faces where it rides', () => {
  const toward = 0.5;
  const backing = updatePlayer(start(), frame(['back']), movement, TICK, false, toward);
  assert.ok(backing.body.moving);
  assert.equal(backing.facing, toward);
  const mounted = updatePlayer(start(), frame([], ['mount']), movement, TICK);
  const riding = updatePlayer(mounted, frame(['back']), movement, TICK, false, toward);
  assert.notEqual(riding.facing, toward);
});

test("a rider's jump boosts the horse, as a horse never jumps; on foot a jump boosts nothing", () => {
  const mounted = updatePlayer(start(), frame([], ['mount']), movement, TICK);
  const boosted = updatePlayer(mounted, frame(['forward'], ['jump']), movement, TICK);
  assert.ok((boosted.body.boosting ?? 0) > 0, 'boosting');
  assert.equal(boosted.body.vz, 0, 'and not in the air');
  const jumped = updatePlayer(start(), frame([], ['jump']), movement, TICK);
  assert.equal(jumped.body.boosting ?? 0, 0);
  assert.ok(jumped.body.vz > 0, 'a jump on foot');
});

test('locked on, a sprint faces where it runs, and once it ends the figure faces its foe again', () => {
  const toward = 0.5;
  const sprinting = updatePlayer(start(), frame(['back', 'run']), movement, TICK, false, toward);
  assert.ok(sprinting.body.moving);
  assert.equal(sprinting.facing, sprinting.body.facing, 'where it runs');
  assert.notEqual(sprinting.facing, toward);
  const walking = updatePlayer(sprinting, frame(['back']), movement, TICK, false, toward);
  assert.equal(walking.facing, toward, 'walking away, it backs off facing its foe');
  const stopped = updatePlayer(sprinting, frame(), movement, TICK, false, toward);
  assert.equal(stopped.facing, toward, 'stopped, it faces its foe');
  const held = updatePlayer(stopped, frame(['run']), movement, TICK, false, toward);
  assert.equal(held.facing, toward, 'the run held standing still is no sprint');
  const ahead = updatePlayer(start(), frame(['forward', 'left', 'run']), movement, TICK, false, toward);
  assert.equal(ahead.facing, ahead.body.facing, 'a sprint any way faces where it runs');
});

test('locked on, a crouched figure with the run held goes at a crouch and keeps facing its foe', () => {
  const toward = 0.5;
  const crouched = updatePlayer(start(), frame([], ['crouch']), movement, TICK, false, toward);
  assert.ok(crouched.body.crouched);
  const creeping = updatePlayer(crouched, frame(['back', 'run']), movement, TICK, false, toward);
  assert.ok(creeping.body.moving && creeping.body.crouched);
  assert.equal(creeping.facing, toward);
});

test('1 draws the Melee loadout and 2 the Ranged, each readying it; Melee is drawn first', () => {
  const player = start();
  assert.equal(player.loadout, 0);
  const ranged = updatePlayer(player, frame([], ['ranged']), movement, TICK);
  assert.deepEqual([ranged.loadout, ranged.drawn], [1, true]);
  const melee = updatePlayer({ ...ranged, drawn: false }, frame([], ['melee']), movement, TICK);
  assert.deepEqual([melee.loadout, melee.drawn], [0, true]);
  assert.equal(updatePlayer(ranged, frame(), movement, TICK).loadout, 1, 'kept until the other is drawn');
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
  player = updatePlayer({ ...player, cast: 0 }, frame(), movement, TICK);
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

test('between ticks a move over a lip is drawn eased too, and a new one starts from its own start', () => {
  const player = start();
  const move = (progress: number) => ({ from: [0, 0, 0] as const, to: [0, 1, 2] as const, progress, seconds: 0.5 });
  const going = {
    ...player,
    previous: { ...player.body, over: move(0.2) },
    body: { ...player.body, over: move(0.4) },
    blend: 0.5,
  };
  assert.ok(Math.abs((shownBody(going).over?.progress ?? 0) - 0.3) < 1e-12);
  const anew = { ...going, previous: { ...player.body, over: move(1) }, body: { ...player.body, over: move(0.1) } };
  assert.equal(shownBody(anew).over?.progress, 0.1);
});

test('going over a lip, the body’s centre passes behind the wall’s face, but its card stays in front', () => {
  // The course's ledge: x 0 to 6, its face at y -1, its lip 2.3 m up. The player walks north at it, jumps and goes
  // over.
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

test("the camera's blocks are a node's boxes, an outpost's walls and any more, joined once while all stay the same", () => {
  const box = (minX: number) => ({ minX, minY: 0, bottom: 0, maxX: minX + 1, maxY: 1, top: 1 });
  const [boxes, walls, more] = [[box(0), box(2)], [box(8)], [box(4)]];
  assert.equal(withBlocks(boxes, undefined, undefined), boxes);
  assert.equal(withBlocks(boxes, [], []), boxes);
  const joined = withBlocks(boxes, walls, more);
  assert.deepEqual(joined, [...boxes, ...walls, ...more]);
  assert.equal(withBlocks(boxes, walls, more), joined, 'the same list again');
  assert.notEqual(withBlocks(boxes, walls, [box(6)]), joined, 'more blocks of another deck join afresh');
  assert.deepEqual(withBlocks(boxes, [box(10)], more), [...boxes, box(10), ...more], 'and walls raised anew');
});
