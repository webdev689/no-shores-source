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
import { type Action, BINDS, type InputFrame } from '../player/input.ts';
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

/** The player with a sword drawn (or `right`, once the room's gear wears it) in a fight in a room in the page, standing
 *  at `start` (the course's own), the first person's hands standing in: each frame's button, pose, pace and spare are kept,
 *  what the forge warms, and the room's last word on the gear. */
function fightingPlayer(right = 'sword_iron', start: { readonly x: number; readonly y: number } = course.start) {
  type State = { right?: string | null; pose?: unknown; pace?: unknown; spare?: unknown };
  type Shown = {
    attackPressed: boolean;
    right: unknown;
    pose: unknown;
    pace: unknown;
    spare: unknown;
    way: number | null;
  };
  const shown: Shown[] = [];
  const said: { gear: GearMessage | null } = { gear: null };
  const loads = { count: 0 };
  const hands = {
    strokes: () => 0,
    swing: null,
    muzzle: null,
    cancel: () => undefined,
    loaded: () => (loads.count += 1),
    update: (_seconds: number, button: { attackPressed: boolean }, state: State) => {
      const { right = null, pose = null, pace = null, spare = null } = state;
      // The way, 1 to 6, the hands draw a swing begun now: their share of DFO's six, as the walker sets it.
      const way = button.attackPressed ? Math.floor(hands.strokes() * 6) + 1 : null;
      shown.push({ attackPressed: button.attackPressed, right, pose, pace, spare, way });
    },
  } as unknown as ConstructorParameters<typeof Walker>[2];
  const warmed: { right: string | null; glow: unknown; owner: unknown }[] = [];
  const forge = {
    frames: () => 4,
    draws: () => true,
    warm: (dress: Dress, _anims: unknown, glow: unknown, owner: unknown) =>
      warmed.push({ right: dress.outfit.right, glow, owner }),
    walking: () => null,
    pump: () => undefined,
    card: () => null,
  } as unknown as Cards;
  const dress = plainDress('human', 0.3);
  const you = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  you.dress = { ...dress, outfit: { ...dress.outfit, right, drawn: true } };
  const walker = new Walker(newPlayer(movement, start.x, start.y), you, hands, forge);
  let fight: Fighting | null = null;
  const room = LocalRoom.open(
    compiled,
    start,
    course.blocks,
    (snapshot: Snapshot) => fight?.receive(snapshot),
    (gear) => (said.gear = gear),
  );
  // Every input the page sends the room, counted.
  const sent = { count: 0 };
  const send = room.send.bind(room);
  room.send = (bytes) => {
    sent.count += 1;
    send(bytes);
  };
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  room.pump(TICK);
  const player = new PlayerFight(fighting, rules, walker);
  const steps = fighting.steps(movement);
  let clock = 0;
  const frame = (input: InputFrame, bearer: { readonly charged: boolean } | null = null, running = true) => {
    clock += TICK;
    const asked = { running, hands: true, markOf: () => null, zoomOf: () => 1, bearer };
    return player.frame(input, steps, TICK, clock, asked);
  };
  return { fighting, walker, shown, frame, said, warmed, loads, sent };
}

test("the other loadout's weapon is composed ahead of a swap, for the figure and for the hands", () => {
  const { walker, shown, frame, warmed } = fightingPlayer();
  walker.spare = { ...walker.you.dress.outfit, right: 'bow_long_iron', left: null };
  walker.spareGlow = 2;
  frame(controls());
  assert.ok(
    warmed.some((each) => each.right === 'bow_long_iron' && each.glow === 2 && each.owner !== walker.you.id),
    'the figure, glowing as it will once worn',
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

test('the dress the room is told carries the element the weapon glows in, for other players to see', () => {
  const { walker, frame } = fightingPlayer();
  frame(controls());
  assert.equal(JSON.parse(walker.lookDress).glow, undefined, 'a plain weapon says none');
  walker.glow = [2, 0];
  frame(controls());
  assert.deepEqual(JSON.parse(walker.lookDress).glow, [2, 0]);
});

test('a weapon changed mid-swing is shown as the rules take it up, once the swing is over', () => {
  const { fighting, walker, shown, frame } = fightingPlayer();
  frame(controls());
  frame(controls(['swing'], ['swing']));
  frame(controls());
  assert.equal(fighting.own?.action.kind, 'attack');
  // The other loadout chosen, as the page dresses the player in it at once.
  walker.you.dress = { ...walker.you.dress, outfit: { ...walker.you.dress.outfit, right: 'pistolet' } };
  shown.length = 0;
  const ruled: string[] = [];
  for (let tick = 0; tick < 60; tick++) {
    frame(controls());
    ruled.push(fighting.own?.action.kind === 'attack' ? 'sword' : 'after');
  }
  const swinging = ruled.lastIndexOf('sword');
  assert.ok(swinging > 10 && swinging < 50, `the swing ran on (${swinging})`);
  assert.ok(
    shown.slice(0, swinging + 1).every((each) => each.right === 'sword_iron'),
    'the sword in hand while the rules swing it',
  );
  assert.equal(shown.at(-1)?.right, 'pistolet', 'the gun once they take it up');
  assert.equal(fighting.arms, startCombatRules(compiled).armsCode('pistolet', null, true), 'the gun asked for');
  assert.equal(walker.shownDress.outfit.right, 'pistolet');
});

test('the sights follow the weapon in hand: a gun chosen mid-swing brings them up only as the rules take it up', () => {
  const { fighting, walker, frame } = fightingPlayer();
  frame(controls());
  frame(controls(['swing'], ['swing']));
  frame(controls());
  assert.equal(fighting.own?.action.kind, 'attack');
  walker.you.dress = { ...walker.you.dress, outfit: { ...walker.you.dress.outfit, right: 'pistolet' } };
  const seen: { swinging: boolean; sights: boolean }[] = [];
  for (let tick = 0; tick < 60; tick++) {
    const { rangedDrawn } = frame(controls());
    seen.push({ swinging: fighting.own?.action.kind === 'attack', sights: rangedDrawn });
  }
  const during = seen.filter((each) => each.swinging);
  assert.ok(during.length > 10, `the swing ran on (${during.length} frames)`);
  assert.ok(
    during.every((each) => !each.sights),
    'no crosshair or shots shown while the sword is still swung',
  );
  assert.equal(seen.at(-1)?.sights, true, "the gun's sights once the rules take it up");
});

test("a ranged weapon in hand turns the pad's triggers round, whichever page the player fights on", () => {
  const { walker, frame } = fightingPlayer();
  frame(controls());
  assert.equal(BINDS.ranged, false, 'a sword: RT swings');
  walker.you.dress = { ...walker.you.dress, outfit: { ...walker.you.dress.outfit, right: 'pistolet' } };
  for (let tick = 0; tick < 60; tick++) frame(controls());
  assert.equal(BINDS.ranged, true, 'a gun: RT fires');
  BINDS.ranged = false;
});

test('a climb begun while the rules reload puts the held weapon away, though the rules still hold it', () => {
  // Facing the course's tall wall from just short of its near face: a reload lets the body walk into it and climb.
  const { fighting, walker, frame, said } = fightingPlayer('pistolet', { x: 11, y: -0.6 });
  const ask = (gear: Parameters<Fighting['askGear']>[0]) => {
    fighting.askGear(gear);
    for (let tick = 0; tick < 20; tick++) frame(controls());
  };
  ask({ kind: ASKS.grantItem, itemKind: KINDS.indexOf('pistolet'), rarity: 0, level: 1 });
  const pistolet = said.gear?.items.find((item) => KINDS[item.kind] === 'pistolet');
  ask({ kind: ASKS.wear, item: pistolet?.id ?? 0, slot: 1 });
  frame(controls(['guard'], ['guard']));
  while (fighting.own?.action.kind !== 'reload') frame(controls());
  let climbed = false;
  for (let tick = 0; tick < 60 && fighting.own?.action.kind === 'reload'; tick++) {
    frame(controls(['forward']));
    if (walker.player.body.mode !== 'climb') continue;
    climbed = true;
    assert.equal(walker.shownDress.outfit.drawn, false, `put away on the wall at tick ${tick}`);
  }
  assert.ok(climbed, 'the body took to the wall while the rules reloaded');
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
  const { fighting, shown, frame, said, loads } = fightingPlayer('pistolet');
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
  // The hands are loaded as the rules' reload ends, never during it: a quicker reload or a kill can end it early.
  assert.equal(fighting.own?.action.kind, 'reload');
  loads.count = 0;
  frame(controls());
  assert.equal(loads.count, 0, 'not while the rules reload');
  while (fighting.own?.action.kind === 'reload') frame(controls());
  frame(controls());
  assert.ok(loads.count > 0, 'loaded once the rules are');
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
  assert.ok(action?.kind === 'attack' && action.stroke === stroke, 'with the stroke the click chose');
});

test('in the first person each swing is drawn the way the chain strikes it: side cut, overhead, thrust', () => {
  const { shown, frame } = fightingPlayer();
  frame(controls());
  frame(controls(['swing'], ['swing']));
  for (let tick = 0; tick < 150; tick++) frame(controls(['swing']));
  const ways = shown.flatMap((each) => (each.way === null ? [] : [each.way]));
  assert.deepEqual(ways.slice(0, 4), [3, 1, 6, 3]);
});

test('locked on, a dodge is drawn rolling the way it goes, while the rules keep the fighter facing its foe', () => {
  const { fighting, walker, frame } = fightingPlayer();
  fighting.ask({ type: 2, rank: 2 });
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

test("bearing the Lodestone, an Art's key asks the room to ground it and plays no spell; unborne, the Art is cast", () => {
  const { fighting, walker, frame } = fightingPlayer();
  for (let step = 0; step < 4; step++) frame(controls());
  frame(controls([], ['tenetOne']), { charged: true });
  frame(controls(), { charged: true });
  assert.deepEqual([fighting.castSent, walker.player.cast], [null, null], 'no spell sent to be shown, no cast begun');
  const unborne = fightingPlayer();
  for (let step = 0; step < 4; step++) unborne.frame(controls());
  unborne.frame(controls([], ['tenetOne']));
  unborne.frame(controls());
  assert.notEqual(unborne.fighting.castSent, null, 'Storm worn: its First Tenet cast');
});

test('while a cutscene holds the room still, the page sends it no inputs, so none are left waiting once it runs', () => {
  const { frame, sent } = fightingPlayer();
  frame(controls());
  const before = sent.count;
  for (let held = 0; held < 60; held++) frame(controls(), null, false);
  assert.equal(sent.count, before, 'a second held sends nothing');
  frame(controls());
  assert.equal(sent.count, before + 1, 'running again, one input a tick');
});

test('the click that draws the weapon swings it too: one click with it put away, as the game begins', () => {
  const { fighting, walker, shown, frame } = fightingPlayer();
  walker.you.dress = { ...walker.you.dress, outfit: { ...walker.you.dress.outfit, drawn: false } };
  frame(controls());
  assert.equal(fighting.arms, startCombatRules(compiled).armsCode('sword_iron', null, false), 'the sword put away');
  frame(controls(['swing'], ['swing']));
  for (let ticks = 0; ticks < 5; ticks += 1) frame(controls(['swing']));
  assert.equal(walker.you.dress.outfit.drawn, true, 'drawn');
  const action = fighting.own?.action;
  assert.ok(action?.kind === 'attack', `swung with the one click, as the room has it: ${action?.kind}`);
  assert.equal(action.strike, 18, "the sword's swing, not the fists'");
  assert.ok(
    shown.some((each) => each.attackPressed),
    'the first person swings',
  );
});
