import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { LocalRoom } from '../network/localRoom.ts';
import { ASKS } from '../network/gearMessages.ts';
import type { GearMessage, Snapshot } from '../network/roomConnection.ts';
import type { Cards } from '../player/cards.ts';
import { type Dress, plainDress } from '../player/dressing.ts';
import { KINDS } from '../player/gear.ts';
import type { Action, InputFrame } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { Walker } from '../player/walker.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { Fighting } from './fighting.ts';
import { PlayerFight } from './playerFight.ts';

const built = (name: string) =>
  readFile(new URL(`../../../target/wasm32-unknown-unknown/release/${name}.wasm`, import.meta.url)).catch(() => {
    throw new Error(`${name}.wasm is not built: run \`npm run wasm\` first`);
  });
const compiled = new WebAssembly.Module(await built('room_wasm'));
const movement = await startMovementRules(await built('movement_wasm'));
movement.setCourse(course.blocks);
const TICK = movement.tickSeconds;

/** A frame with these actions held, and those pressed this frame, the pointer held. */
function controls(held: Action[] = [], pressed: Action[] = []): InputFrame {
  return {
    held: (action) => held.includes(action) || pressed.includes(action),
    pressed: (action) => pressed.includes(action),
    released: () => false,
    lookX: 0,
    lookY: 0,
    wheel: 0,
    locked: true,
  };
}

/** The player with a sword drawn (or `right`, once the room's gear wears it) in a fight in a room in the page, the first
 *  person's hands standing in: each frame's button, pose, pace and spare are kept, what the forge warms, and the room's
 *  last word on the gear. */
function fightingPlayer(right = 'sword_iron') {
  type State = { pose?: unknown; pace?: unknown; spare?: unknown };
  const shown: { attackPressed: boolean; pose: unknown; pace: unknown; spare: unknown }[] = [];
  const said: { gear: GearMessage | null } = { gear: null };
  const hands = {
    swing: null,
    muzzle: null,
    cancel: () => undefined,
    update: (_seconds: number, button: { attackPressed: boolean }, state: State) => {
      const { pose = null, pace = null, spare = null } = state;
      shown.push({ attackPressed: button.attackPressed, pose, pace, spare });
    },
  } as unknown as ConstructorParameters<typeof Walker>[2];
  const warmed: { right: string | null; owner: unknown }[] = [];
  const forge = {
    frames: () => 4,
    draws: () => true,
    warm: (dress: Dress, _anims: unknown, _glow: unknown, owner: unknown) =>
      warmed.push({ right: dress.outfit.right, owner }),
    walking: () => null,
    pump: () => undefined,
    card: () => null,
  } as unknown as Cards;
  const dress = plainDress('human', 0.3);
  const you = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  you.dress = { ...dress, outfit: { ...dress.outfit, right, drawn: true } };
  const walker = new Walker(newPlayer(movement, course.start.x, course.start.y), you, hands, forge);
  let fight: Fighting | null = null;
  const room = LocalRoom.open(
    compiled,
    course.start,
    course.blocks,
    (snapshot: Snapshot) => fight?.receive(snapshot),
    (gear) => (said.gear = gear),
  );
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  room.pump(TICK);
  const player = new PlayerFight(fighting, rules, walker);
  const steps = fighting.steps(movement);
  let clock = 0;
  const frame = (input: InputFrame) => {
    clock += TICK;
    return player.frame(input, steps, TICK, clock, { running: true, hands: true, markOf: () => null, zoomOf: () => 1 });
  };
  return { fighting, walker, shown, frame, said, warmed };
}

test("the other loadout's weapon is composed ahead of a swap, for the figure and for the hands", () => {
  const { walker, shown, frame, warmed } = fightingPlayer();
  walker.spare = { ...walker.you.dress.outfit, right: 'bow_long_iron', left: null };
  frame(controls());
  assert.ok(
    warmed.some((each) => each.right === 'bow_long_iron' && each.owner !== walker.you.id),
    'the figure',
  );
  assert.ok(
    warmed.some((each) => each.right !== 'bow_long_iron' && each.owner === walker.you.id),
    'its own apart',
  );
  assert.deepEqual(shown.at(-1)?.spare, { right: 'bow_long_iron', left: null }, 'the hands');
});

test('a swing pressed reaches the fight, and the first person swings as the rules begin it, the arms told to the room', () => {
  const { fighting, walker, shown, frame } = fightingPlayer();
  frame(controls());
  assert.equal(fighting.arms, startCombatRules(compiled).armsCode('sword_iron', null, true), 'the sword drawn');
  const pressed = frame(controls(['swing'], ['swing']));
  assert.equal(pressed.pressed, true);
  frame(controls(['swing']));
  assert.equal(fighting.own?.action.kind, 'attack');
  const begun = shown.find((each) => each.attackPressed);
  assert.ok(begun, 'swung in the first person once the rules began it');
  // The hands are paced by the rules' own swing: a sword's blow lands at 18 ticks of 45.
  const action = fighting.own?.action;
  assert.ok(action?.kind === 'attack');
  assert.deepEqual(begun.pace, { strike: action.strike * TICK, end: action.end * TICK, at: 0 });
  assert.deepEqual([action.strike, action.end], [18, 45]);
  assert.deepEqual(fighting.look, walker.look, 'the room is told what the figure shows');
  assert.equal(fighting.dress, walker.lookDress);
});

test('the guard held stands the first person in its pose, and the figure faces where its arms point', () => {
  const { fighting, walker, shown, frame } = fightingPlayer();
  frame(controls());
  frame(controls(['guard'], ['guard']));
  frame(controls(['guard']));
  assert.ok(fighting.own?.action.kind === 'parry' || fighting.own?.action.kind === 'guard');
  assert.notEqual(shown.at(-1)?.pose, null, 'posed');
  assert.equal(walker.you.facing, fighting.own?.aim);
});

test('a gun fires in the first person only as the rules let its shot go: with no ammunition, a pull plays nothing', () => {
  const { fighting, shown, frame, said } = fightingPlayer('pistolet');
  const ask = (gear: Parameters<Fighting['askGear']>[0]) => {
    fighting.askGear(gear);
    for (let tick = 0; tick < 20; tick++) frame(controls());
  };
  ask({ kind: ASKS.grantItem, itemKind: KINDS.indexOf('pistolet'), rarity: 0, level: 1 });
  const pistolet = said.gear?.items.find((item) => KINDS[item.kind] === 'pistolet');
  ask({ kind: ASKS.wear, item: pistolet?.id ?? 0, slot: 1 });
  const pull = () => {
    shown.length = 0;
    frame(controls(['guard'], ['guard']));
    for (let tick = 0; tick < 10; tick++) frame(controls());
    return shown.filter((each) => each.attackPressed).length;
  };
  assert.equal(fighting.own?.ammo, 24, 'a full pistolet');
  assert.equal(pull(), 1, 'loaded, the shot plays once, as the rules let it go');
  assert.equal(fighting.own?.ammo, 23);
  for (let tick = 0; tick < 200; tick++) frame(controls());
  ask({ kind: ASKS.grantAmmo, count: 0 });
  assert.equal(fighting.own?.ammo, 0);
  assert.equal(pull(), 0, 'empty, the rules let none go and none plays');
  assert.equal(fighting.own?.action.kind, 'idle');
});

test('a swing clicked early in a weapon swap plays in the first person on the very tick the swap ends', () => {
  const { fighting, walker, shown, frame, said } = fightingPlayer();
  const ask = (gear: Parameters<Fighting['askGear']>[0]) => {
    fighting.askGear(gear);
    for (let tick = 0; tick < 20; tick++) frame(controls());
  };
  ask({ kind: ASKS.grantItem, itemKind: KINDS.indexOf('pistolet'), rarity: 0, level: 1 });
  ask({ kind: ASKS.wear, item: said.gear?.items.find((item) => KINDS[item.kind] === 'pistolet')?.id ?? 0, slot: 1 });
  const take = (right: string) => {
    walker.you.dress = { ...walker.you.dress, outfit: { ...walker.you.dress.outfit, right } };
    frame(controls());
  };
  take('pistolet');
  for (let tick = 0; tick < 40; tick++) frame(controls());
  assert.equal(fighting.own?.arms, startCombatRules(compiled).armsCode('pistolet', null, true), 'the gun taken up');
  take('sword_iron');
  // The sword's arms reach the next tick's input, the swap's first; the click lands on it and is let go at once.
  shown.length = 0;
  frame(controls(['swing'], ['swing']));
  const stroke = fighting.stroke;
  for (let tick = 0; tick < 40; tick++) frame(controls());
  const swap = 24;
  assert.deepEqual(
    shown.map((each) => each.attackPressed).indexOf(true),
    swap,
    'the swing plays on the tick the swap ends, the first a blow may start',
  );
  assert.equal(shown.filter((each) => each.attackPressed).length, 1, 'once');
  const action = fighting.own?.action;
  assert.ok(action?.kind === 'attack' && action.stroke === stroke, 'with the stroke the click rolled');
});

test('locked on, a dodge is drawn rolling the way it goes, while the rules keep the fighter facing its foe', () => {
  const { fighting, walker, frame } = fightingPlayer();
  fighting.ask({ type: 14, rank: 2 });
  for (let tick = 0; tick < 20; tick += 1) frame(controls());
  frame(controls(['swing'], ['swing']));
  for (let tick = 0; tick < 50; tick += 1) frame(controls());
  assert.notEqual(fighting.own?.target ?? null, null, 'locked on a foe');
  frame(controls(['dodge', 'right'], ['dodge']));
  frame(controls(['right']));
  const own = fighting.own;
  assert.equal(own?.action.kind, 'dodge');
  const east = Math.PI / 2;
  assert.ok(Math.abs((own?.aim ?? east) - east) > 0.5, `the rules face the foe: ${own?.aim}`);
  assert.ok(Math.abs(walker.you.facing - east) < 1e-9, `the figure rolls east: ${walker.you.facing}`);
  assert.equal(walker.look.facing, walker.you.facing, 'the room is told it so');
});
