import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { readFromRoom } from '../network/messages.ts';
import type { FlyingShot } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { type CombatRules, type Fired, startCombatRules } from '../rules/combatRules.ts';
import { FIGHTER_FLOATS, GLANCE_FLOATS } from '../rules/fighters.ts';
import type { Body, Controls, MovementRules } from '../rules/movementRules.ts';
import { type FightButtons, Fighting, strokesReaching } from './fighting.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;

/** The movement rules as the fight wraps them: only its step is asked here. */
const movement = { tickSeconds: TICK } as unknown as MovementRules;

/** Ticks, the controls held, and the fight's buttons held through them: walk, swing a sword, walk on guarding, dodge
 *  aside, stand still. */
const SCRIPT: readonly [number, Partial<Controls>, Partial<FightButtons>][] = [
  [30, { forward: 1, yaw: 0.2 }, {}],
  [70, { yaw: 0.2 }, { swing: true }],
  [40, { forward: 1, yaw: -0.4 }, { guard: true }],
  [1, { sideways: 1, yaw: -0.4 }, { dodge: true }],
  [40, { yaw: -0.4 }, {}],
];

test('the page predicts its own fighter exactly as its room steps it, through swings, guards and dodges', () => {
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  fighting.arms = rules.armsCode('sword_iron', null, true);
  room.pump(TICK);
  const steps = fighting.steps(movement);
  let body = {} as Body;
  let ticks = 0;
  let swings = 0;
  for (const [count, controls, buttons] of SCRIPT) {
    for (let tick = 0; tick < count; tick += 1) {
      const held = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
      fighting.press({ swing: false, shoot: false, guard: false, dodge: false, pitch: 0, ...buttons });
      body = steps.step(body, { ...held, ...controls });
      const predicted = JSON.stringify(fighting.own);
      swings += fighting.swingsBegun;
      fighting.swingsBegun = 0;
      room.pump(TICK);
      // The room has taken this input: its word is the fighter the page predicted, to the bit.
      assert.equal(JSON.stringify(fighting.own), predicted, `tick ${ticks}`);
      ticks += 1;
    }
  }
  assert.equal(swings, 2, 'holding the button for 70 ticks swings twice');
  assert.ok(body.x !== 0 && Number.isFinite(body.y));
});

test('every foe asked for comes, one with each input, even two asked for within one tick', () => {
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  const steps = fighting.steps(movement);
  const held = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  fighting.ask(1);
  fighting.ask(3);
  for (let tick = 0; tick < 4; tick += 1) {
    steps.step({} as Body, held);
    room.pump(TICK);
  }
  assert.deepEqual([...fighting.foes.values()].map((foe) => foe.kind).sort(), [1, 3]);
});

const STILL: Controls = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
const UNPRESSED: FightButtons = { swing: false, shoot: false, guard: false, dodge: false, pitch: 0 };

/** A fight in a room in the page, its player holding `right`, and a tick that steps it with these buttons pressed. */
function fightIn(right: string) {
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  fighting.arms = rules.armsCode(right, null, true);
  room.pump(TICK);
  const steps = fighting.steps(movement);
  const tick = (buttons: Partial<FightButtons> = {}) => {
    fighting.press({ ...UNPRESSED, ...buttons });
    steps.step({} as Body, STILL);
    room.pump(TICK);
  };
  return { fighting, tick };
}

test('a guard or a swing tapped between two ticks still reaches the rules', () => {
  const guarded = fightIn('sword_iron');
  guarded.tick({ guardPressed: true });
  assert.deepEqual(guarded.fighting.own?.action, { kind: 'guard', elapsed: 0, window: 12 });
  const swung = fightIn('sword_iron');
  swung.tick({ swingPressed: true });
  assert.equal(swung.fighting.own?.action.kind, 'attack');
  assert.equal(swung.fighting.swingsBegun, 1);
});

test('the other guard binding pressed while one is held opens a fresh parry window', () => {
  const { fighting, tick } = fightIn('sword_iron');
  tick({ guard: true, guardPressed: true });
  for (let count = 0; count < 60; count += 1) tick({ guard: true });
  assert.equal(fighting.own?.action.kind === 'guard' && fighting.own.action.elapsed, 60);
  tick({ guard: true, guardPressed: true });
  tick({ guard: true });
  assert.deepEqual(fighting.own?.action, { kind: 'guard', elapsed: 0, window: 12 });
});

test('a bow aimed and lowered unfired tells the page; an aimed pull hands over the arrow it fired', () => {
  const { fighting, tick } = fightIn('bow_long');
  for (let count = 0; count < 5; count += 1) tick({ aim: true });
  tick();
  assert.deepEqual([fighting.own?.action.kind, fighting.drawsDropped, fighting.fired.length], ['idle', 1, 0]);
  for (let count = 0; count < 10; count += 1) tick({ aim: true });
  tick({ aim: true, shoot: true, shootPressed: true });
  assert.deepEqual([fighting.own?.action.kind, fighting.drawsDropped, fighting.fired.length], ['reload', 1, 1]);
  assert.equal(fighting.fired[0]?.ranged, 1, 'an arrow');
});

test('a gun fired from the hip hands over its whole line, and no guard rises behind it', () => {
  const { fighting, tick } = fightIn('pistolet');
  tick({ guard: true, guardPressed: true });
  assert.equal(fighting.own?.action.kind, 'idle', 'no guard with a gun');
  tick({ shoot: true, shootPressed: true });
  const [ball] = fighting.fired;
  assert.equal(fighting.fired.length, 1);
  assert.ok(ball && Math.hypot(...ball.velocity) * TICK > 1, 'a line, not a flight');
});

/** A fight whose rules fire a shot on every tick while `firing` says so, linked to no room: its snapshots are handed
 *  in by the test, each the room's word on the player's fighter after input `acknowledged`, with these shots. */
function fightByHand() {
  const shot: Fired = { ranged: 3, at: [0, 0, 1], velocity: [0, -3600, 0] };
  const control = { firing: false };
  const rules = {
    predict: (fighter: Float64Array) => ({ fighter, fired: control.firing ? shot : null }),
    strokeReach: () => 1,
  } as unknown as CombatRules;
  const link = {
    player: 1,
    dressed: [],
    lost: null,
    send: () => undefined,
    pump: () => undefined,
  } as unknown as RoomLink;
  const fighting = new Fighting(rules, link);
  let tick = 0n;
  const word = (acknowledged: number, shots: readonly FlyingShot[] = []) => {
    tick += 1n;
    const fighter = new Float64Array(FIGHTER_FLOATS);
    const seen = { player: 1, acknowledged, fighter };
    fighting.receive({
      kind: 'snapshot',
      tick,
      players: [seen],
      dressed: [],
      foes: [],
      events: [],
      shots,
    } as unknown as Snapshot);
  };
  const steps = fighting.steps(movement);
  const step = () => steps.step({} as Body, STILL);
  return { fighting, control, word, step };
}

test("a shot an input lets go only once the room's word is replayed is handed over once; one already handed over is not", () => {
  const { fighting, control, word, step } = fightByHand();
  word(0);
  step();
  assert.equal(fighting.fired.length, 0, 'first predicted, the input fired nothing');
  control.firing = true;
  word(0);
  assert.equal(fighting.fired.length, 1, "replayed on the room's word, it fires: the player sees it");
  word(0);
  assert.equal(fighting.fired.length, 1, 'replayed again, it is the same shot');
  step();
  word(0);
  assert.equal(fighting.fired.length, 2, 'a shot first predicted is handed over once, however often it is replayed');
});

test("every snapshot's shots are handed over once, however many came in a frame", () => {
  const { fighting, word } = fightByHand();
  const ball = (owner: number): FlyingShot => ({ owner, ranged: 3, at: [0, 0, 1], velocity: [0, -3600, 0], age: 0 });
  word(0, [ball(2)]);
  word(0, [ball(3)]);
  assert.deepEqual(
    fighting.takeShots().map((shot) => shot.owner),
    [2, 3],
  );
  assert.deepEqual(fighting.takeShots(), []);
});

test('a dress too long for the room is never sent: the room takes every input, and the last dress that fit', () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const player = door.join();
  const answers = new Set<string>();
  const dressed: string[] = [];
  let fight: Fighting | null = null;
  const link: RoomLink = {
    player,
    dressed: [],
    lost: null,
    send: (bytes) => answers.add(door.input(player, bytes)),
    pump: () => {
      door.tick();
      const message = readFromRoom(door.snapshot());
      if (message?.kind !== 'snapshot') return;
      dressed.push(...message.dressed.map((each) => each.dress));
      fight?.receive(message);
    },
  };
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, link);
  fight = fighting;
  link.pump(TICK);
  const steps = fighting.steps(movement);
  for (const dress of ['{"short":1}', 'x'.repeat(5000), 'x'.repeat(5000)]) {
    fighting.dress = dress;
    for (let count = 0; count < 3; count += 1) {
      steps.step({} as Body, STILL);
      link.pump(TICK);
    }
  }
  assert.deepEqual([...answers], ['taken']);
  assert.deepEqual(dressed, ['{"short":1}']);
});

test('a swing rolls among the strokes that reach its target, and among all six when none does or none is locked', () => {
  const reach = (stroke: number) => (stroke === 6 ? 2.8 : stroke === 1 ? 2.4 : 2.2);
  assert.deepEqual(strokesReaching(2.6, reach), [6]);
  assert.deepEqual(strokesReaching(2.3, reach), [1, 6]);
  assert.deepEqual(strokesReaching(3, reach), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(strokesReaching(null, reach), [1, 2, 3, 4, 5, 6]);
});

test('a foe’s two glances are as many ticks apart as the snapshots that brought them', () => {
  const rules = startCombatRules(compiled);
  const link: RoomLink = { player: 1, dressed: [], lost: null, send: () => undefined, pump: () => undefined };
  const fighting = new Fighting(rules, link);
  const glance = (east: number) => Object.assign(new Float64Array(GLANCE_FLOATS), { 0: east });
  const snapshot = (tick: bigint, east: number): Snapshot => ({
    kind: 'snapshot',
    tick,
    players: [],
    dressed: [],
    foes: [{ id: 7, kind: 2, glance: glance(east) }],
    events: [],
    shots: [],
    ships: [],
  });
  fighting.receive(snapshot(10n, 0));
  fighting.receive(snapshot(13n, 0.15));
  const kept = fighting.foes.get(7);
  assert.deepEqual([kept?.before?.x, kept?.view.x, kept?.ticks, fighting.roomTick], [0, 0.15, 3, 13]);
});
