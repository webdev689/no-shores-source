import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Action, InputFrame } from './input.ts';
import { BLOW_SECONDS, newPlayer, updatePlayer } from './player.ts';

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
const TICK = 1 / 60;

test('a right click readies a weapon that is away; with it ready, a click swings and holding swings again', () => {
  let player = updatePlayer(newPlayer(0, 0), frame([], ['swing']), [], TICK);
  assert.equal(player.drawn, true);
  assert.equal(player.blow, null);
  player = updatePlayer(player, frame([], ['swing']), [], TICK, () => 0);
  assert.deepEqual(player.blow, { direction: 'down', second: false, elapsed: 0 });
  for (let tick = 0; tick < Math.ceil(BLOW_SECONDS / TICK); tick++)
    player = updatePlayer(player, frame(['swing']), [], TICK, () => 0.99);
  assert.equal(player.blow?.direction, 'up');
  assert.equal(player.blow?.second, true);
  assert.equal(player.blows, 2);
});

test('Z puts the weapon away and readies it; the wheel and Mouse4 move between first and third person', () => {
  const start = newPlayer(0, 0);
  assert.equal(start.view.firstPerson, false);
  assert.equal(updatePlayer(start, frame([], ['ready']), [], TICK).drawn, true);
  assert.equal(updatePlayer(start, frame([], ['perspective']), [], TICK).view.firstPerson, true);
  let player = start;
  for (let notch = 0; notch < 20 && !player.view.firstPerson; notch++)
    player = updatePlayer(player, frame([], [], { wheel: -1 }), [], TICK);
  assert.equal(player.view.firstPerson, true);
});

test('the mouse turns the view; the figure faces where it walks and keeps facing there when still', () => {
  let player = updatePlayer(newPlayer(0, 0), frame([], [], { lookX: 400 }), [], TICK);
  assert.ok(Math.abs(player.yaw - 1) < 1e-9);
  player = updatePlayer(player, frame(['left']), [], TICK);
  const walkingFacing = player.facing;
  player = updatePlayer(player, frame(), [], TICK);
  assert.equal(player.facing, walkingFacing);
  // Casting turns it to the view.
  player = updatePlayer(player, frame([], ['cast']), [], TICK);
  assert.equal(player.facing, player.yaw);
});

test('comma mounts and dismounts; mounted, the player does not swing', () => {
  const mounted = updatePlayer(newPlayer(0, 0), frame([], ['mount']), [], TICK);
  assert.equal(mounted.mounted, true);
  const swung = updatePlayer({ ...mounted, drawn: true }, frame([], ['swing']), [], TICK);
  assert.equal(swung.blow, null);
});
