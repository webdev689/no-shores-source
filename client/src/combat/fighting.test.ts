import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as flatbuffers from 'flatbuffers';
import { Input } from '../../../generated/messages/ts/overlook/wire.ts';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { EVENT } from './cues.ts';
import { SPELLS } from '../network/artMessages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { readFromRoom } from '../network/messages.ts';
import { SnapshotKeeper } from '../network/snapshots.ts';
import type { FlyingShot } from '../network/messages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import { type CombatRules, type Fired, startCombatRules } from '../rules/combatRules.ts';
import { GLANCE_FLOATS, UNTRIMMED_FLOATS } from '../rules/fighters.ts';
import type { Body, Controls, MovementRules } from '../rules/movementRules.ts';
import { ASKS, type GearState } from '../network/gearMessages.ts';
import { KINDS, WORN } from '../player/gear.ts';
import { CHAIN, type FightButtons, Fighting, chained, strokesReaching } from './fighting.ts';
import { KIND, wear } from './wornForTests.ts';

/** A room's snapshot for a player made whole, as a page's link makes it; null for one passed over. */
function wholeOf(kept: SnapshotKeeper, bytes: Uint8Array): Snapshot | null {
  const message = readFromRoom(bytes);
  return message?.kind === 'snapshot' ? kept.whole(message) : null;
}

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
  fighting.ask({ type: 13, rank: 2 });
  fighting.ask({ type: 15, rank: 2 });
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
  let gear: GearState | null = null;
  const room = LocalRoom.open(
    compiled,
    course.start,
    course.blocks,
    (snapshot: Snapshot) => fight?.receive(snapshot),
    (message) => {
      gear = message;
    },
  );
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
  // A weapon the starting kit lacks is handed out and worn first: the room takes arms from gear alone.
  const kind = right.startsWith('bow') ? KIND.bow : right.startsWith('pistolet') ? KIND.pistolet : null;
  if (kind !== null) wear(fighting, () => gear, tick, [kind]);
  return { fighting, tick, gear: () => gear as GearState | null };
}

test('a guard or a swing tapped between two ticks still reaches the rules', () => {
  const guarded = fightIn('sword_iron');
  guarded.tick({ guardPressed: true });
  assert.deepEqual(guarded.fighting.own?.action, { kind: 'guard', elapsed: 0, window: 15 });
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
  assert.deepEqual(fighting.own?.action, { kind: 'guard', elapsed: 0, window: 15 });
});

test('the Test Ground’s hands take up a crossbow through the gear, so the room fights with it and spends its bolts', () => {
  const { fighting, tick, gear } = fightIn('crossbow');
  const crossbow = KINDS.indexOf('crossbow');
  fighting.askGear({ kind: ASKS.grantWorn, itemKind: crossbow });
  for (let count = 0; count < 13; count += 1) tick();
  assert.equal(gear()?.items.find((item) => item.at === WORN + 1)?.kind, crossbow, 'worn in the Ranged slot');
  for (let count = 0; count < 30; count += 1) tick({ shoot: true, shootPressed: count === 0 });
  assert.equal(fighting.fired.length, 1, 'the room let it fire');
  for (let count = 0; count < 13; count += 1) tick();
  assert.ok((gear()?.ammoShare ?? 1) < 1, 'a bolt spent from the ammunition, so a box is taken again');
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
    joins: 1,
    rejoining: false,
    lost: null,
    send: () => undefined,
    pump: () => undefined,
  } as unknown as RoomLink;
  const fighting = new Fighting(rules, link);
  let tick = 0n;
  const word = (acknowledged: number, shots: readonly FlyingShot[] = []) => {
    tick += 1n;
    const fighter = new Float64Array(UNTRIMMED_FLOATS);
    const seen = { player: 1, acknowledged, fighter, standing: { kind: 'inside' } };
    fighting.receive({
      kind: 'snapshot',
      tick,
      players: [seen],
      dressed: [],
      foes: [],
      events: [],
      shots,
      spells: [],
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
  const ball = (owner: number): FlyingShot => ({
    owner,
    ranged: 3,
    at: [0, 0, 1],
    velocity: [0, -3600, 0],
    age: 0,
    muzzle: [0, 0, 1],
    stopped: 0n,
  });
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
  const kept = new SnapshotKeeper();
  const link: RoomLink = {
    player,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: (bytes) => answers.add(door.input(player, bytes)),
    pump: () => {
      door.tick();
      const message = wholeOf(kept, door.snapshot(link.player));
      if (!message) return;
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
  for (const dress of ['{"outfit":{"short":1}}', 'x'.repeat(5000), 'x'.repeat(5000)]) {
    fighting.dress = dress;
    for (let count = 0; count < 3; count += 1) {
      steps.step({} as Body, STILL);
      link.pump(TICK);
    }
  }
  assert.deepEqual([...answers], ['taken']);
  assert.deepEqual(dressed, ['{"outfit":{"short":1}}']);
});

test('a swing rolls among the strokes that reach its target, and among all six when none does or none is locked', () => {
  const reach = (stroke: number) => (stroke === 6 ? 2.8 : stroke === 1 ? 2.4 : 2.2);
  assert.deepEqual(strokesReaching(2.6, reach), [6]);
  assert.deepEqual(strokesReaching(2.3, reach), [1, 6]);
  assert.deepEqual(strokesReaching(3, reach), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(strokesReaching(null, reach), [1, 2, 3, 4, 5, 6]);
});

test('the chain goes side cut, overhead, thrust and round, passing over a stroke that does not reach', () => {
  const all = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(CHAIN, [3, 1, 6]);
  assert.equal(chained(null, all), 3, 'it starts with the side cut');
  assert.equal(chained(3, all), 1);
  assert.equal(chained(1, all), 6);
  assert.equal(chained(6, all), 3, 'and goes round');
  assert.equal(chained(6, [1, 2, 5, 6]), 1, 'past the side cut, which reaches least');
  assert.equal(chained(1, [6]), 6);
  assert.equal(chained(6, [6]), 6, 'the thrust again where only it reaches');
});

test('held, the swings chain side cut, overhead and thrust, and start over after a second without one', () => {
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  fighting.arms = rules.armsCode('sword_iron', null, true);
  room.pump(TICK);
  const steps = fighting.steps(movement);
  const still = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  let body = {} as Body;
  const strokes: number[] = [];
  const hold = (ticks: number, swing: boolean) => {
    for (let tick = 0; tick < ticks; tick += 1) {
      fighting.press({ swing, shoot: false, guard: false, dodge: false, pitch: 0 });
      body = steps.step(body, still);
      const action = fighting.own?.action;
      if (fighting.swingsBegun > 0 && action?.kind === 'attack') strokes.push(action.stroke);
      fighting.swingsBegun = 0;
      room.pump(TICK);
    }
  };
  hold(150, true);
  assert.ok(strokes.length >= 4, `${strokes.length} swings`);
  assert.deepEqual(strokes.slice(0, 4), [3, 1, 6, 3]);
  strokes.length = 0;
  hold(120, false);
  hold(1, true);
  hold(50, false);
  hold(1, true);
  hold(60, false);
  assert.deepEqual(strokes, [3, 1], 'after a rest the side cut first; a swing soon after takes the overhead');
});

test('a foe’s two glances are as many ticks apart as the snapshots that brought them', () => {
  const rules = startCombatRules(compiled);
  const link: RoomLink = {
    player: 1,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: () => undefined,
    pump: () => undefined,
  };
  const fighting = new Fighting(rules, link);
  const glance = (east: number) => Object.assign(new Float64Array(GLANCE_FLOATS), { 0: east });
  const snapshot = (tick: bigint, east: number): Snapshot => ({
    kind: 'snapshot',
    tick,
    players: [],
    flotsam: [],
    kept: [],
    told: [],
    decks: [],
    islands: [],
    taken: [],
    friendlies: [],
    dressed: [],
    plates: [],
    foes: [
      {
        id: 7,
        kind: 2,
        glance: glance(east),
        level: 0,
        shield: null,
        type: 14,
        rank: 2,
        faction: 1,
        phase: 1,
        alert: 0,
      },
    ],
    events: [],
    shots: [],
    ships: [],
    hostiles: [],
    fights: [],
    base: 0n,
    gonePlayers: [],
    goneFoes: [],
    cache: [],
    revives: -1,
    vessels: [],
    balls: [],
    naval: [],
    fightClock: 0,
    worldStart: 0,
    spells: [],
    public: null,
    encounter: null,
  });
  fighting.receive(snapshot(10n, 0));
  fighting.receive(snapshot(13n, 0.15));
  const kept = fighting.foes.get(7);
  assert.deepEqual([kept?.before?.x, kept?.view.x, kept?.ticks, fighting.roomTick], [0, 0.15, 3, 13]);
});

test('a fight whose link joins its room again numbers its inputs anew, sends its dress again, and stands where the new room puts it', () => {
  const [before, after] = [startRoomDoor(compiled), startRoomDoor(compiled)];
  for (const door of [before, after]) door.open(course.start, course.blocks);
  let door = before;
  const answers = new Set<string>();
  const dressed: string[] = [];
  const casts: number[] = [];
  let fight: Fighting | null = null;
  const kept = new SnapshotKeeper();
  const link = {
    player: door.join(),
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: (bytes: Uint8Array<ArrayBuffer>) => {
      casts.push(Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes)).cast());
      answers.add(door.input(link.player, bytes));
    },
    pump: () => {
      door.tick();
      const message = wholeOf(kept, door.snapshot(link.player));
      if (!message) return;
      dressed.push(...message.dressed.map((each) => each.dress));
      fight?.receive(message);
    },
  };
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, link);
  [fight, fighting.dress] = [fighting, '{"outfit":{"short":1}}'];
  link.pump();
  const steps = fighting.steps(movement);
  const walk = (ticks: number, controls: Controls) => {
    for (let count = 0; count < ticks; count += 1) {
      steps.step({} as Body, controls);
      link.pump();
    }
  };
  walk(60, { ...STILL, forward: 1 });
  const walked = fighting.own;
  // A cast pressed as the old room went: it was that room's, and never goes to the new one.
  fighting.cast({ spell: SPELLS.quicken, aim: null });
  // A deploy: the room starts afresh, and the link joins it as its second player.
  [door, dressed.length, casts.length] = [after, 0, 0];
  // A new socket holds no snapshots of the room before.
  kept.clear();
  after.join();
  Object.assign(link, { player: door.join(), joins: 2 });
  answers.clear();
  steps.step({} as Body, STILL);
  assert.equal(answers.size, 0, 'nothing is sent before the new room has said where the player stands');
  link.pump();
  walk(10, STILL);
  assert.deepEqual([...answers], ['taken'], 'every input numbered anew, from 1');
  assert.deepEqual(dressed, ['{"outfit":{"short":1}}'], 'the dress sent again');
  assert.ok(casts.length > 0 && casts.every((cast) => cast === 0), 'the old room’s cast is not sent');
  assert.equal(fighting.joins, 2);
  const [x, y] = [fighting.own?.x ?? 0, fighting.own?.y ?? 0];
  assert.ok(Math.hypot(x - course.start.x, y - course.start.y) < 0.01, `at the new room's spawn: ${x}, ${y}`);
  assert.ok(Math.hypot((walked?.x ?? 0) - course.start.x, (walked?.y ?? 0) - course.start.y) > 1, 'it had walked');
});

test('a respawn asked goes with the next input only', () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const player = door.join();
  const asked: boolean[] = [];
  let fight: Fighting | null = null;
  const kept = new SnapshotKeeper();
  const link: RoomLink = {
    player,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: (bytes) => {
      asked.push(Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes)).respawn());
      door.input(player, bytes);
    },
    pump: () => {
      door.tick();
      const message = wholeOf(kept, door.snapshot(player));
      if (message) fight?.receive(message);
    },
  };
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, link);
  fight = fighting;
  link.pump(TICK);
  const steps = fighting.steps(movement);
  fighting.askRespawn();
  for (let count = 0; count < 3; count += 1) steps.step({} as Body, STILL);
  assert.deepEqual(asked, [true, false, false]);
});

test('a public event’s beats are kept apart from the fight’s events, and its latest word is kept', () => {
  const link = { player: 1, dressed: [], joins: 1, rejoining: false, lost: null, send: () => undefined } as unknown;
  const fighting = new Fighting(startCombatRules(compiled), link as RoomLink);
  const event = (kind: number) => ({ tick: 1n, kind, how: 0, striker: 1, defender: 1, amount: 3, stroke: 0 });
  const word = { kind: 2, phase: 1, marks: [] } as unknown as Snapshot['public'];
  fighting.receive({
    kind: 'snapshot',
    tick: 1n,
    players: [],
    dressed: [],
    foes: [],
    events: [event(1), event(EVENT.chestOpened), event(EVENT.publicBegun)],
    shots: [],
    spells: [],
    public: word,
  } as unknown as Snapshot);
  assert.deepEqual(
    fighting.takeEvents().map((each) => each.kind),
    [1],
    'a chest opened is no blow on the player',
  );
  assert.deepEqual(
    fighting.takePublicEvents().map((each) => each.kind),
    [EVENT.chestOpened, EVENT.publicBegun],
  );
  assert.equal(fighting.takePublicEvents().length, 0, 'handed over once');
  assert.equal(fighting.public, word);
  fighting.receive({
    kind: 'snapshot',
    tick: 2n,
    players: [],
    dressed: [],
    foes: [],
    events: [event(16)],
    shots: [],
    spells: [],
    public: word,
  } as unknown as Snapshot);
  (link as { rejoining: boolean }).rejoining = true;
  assert.equal(fighting.public, null, 'a room lost leaves no event on the screen');
  assert.deepEqual(fighting.takePublicEvents(), [], 'nor its beats');
  (link as { rejoining: boolean }).rejoining = false;
  assert.equal(fighting.public, word, 'back once it holds again');
});

test('on a link that loses inputs and snapshots, each input carries those before it and the player still agrees', () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const player = door.join();
  const answers: string[] = [];
  const kept = new SnapshotKeeper();
  let [sent, pumped] = [0, 0];
  let fight: Fighting | null = null;
  const link: RoomLink = {
    player,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    resend: 3,
    // Every fourth input and every third snapshot are lost on the way.
    send: (bytes) => void ((sent += 1) % 4 !== 0 && answers.push(door.input(player, bytes))),
    pump: () => {
      door.tick();
      const message = wholeOf(kept, door.snapshot(player));
      if ((pumped += 1) % 3 !== 0 && message) fight?.receive(message);
    },
  };
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, link);
  fight = fighting;
  link.pump(TICK);
  const steps = fighting.steps(movement);
  for (let tick = 0; tick < 120; tick++) {
    steps.step({} as Body, { ...STILL, forward: 1, yaw: tick < 60 ? 0 : 1 });
    link.pump(TICK);
  }
  for (let tick = 0; tick < 10; tick++) {
    steps.step({} as Body, STILL);
    link.pump(TICK);
  }
  assert.deepEqual([...new Set(answers)], ['taken'], 'no input was ever missing to the room');
  // At rest, one more tick moves no one: the room's word on the player, as the page keeps it.
  door.tick();
  const room = wholeOf(kept, door.snapshot(player))?.players[0]?.body;
  const own = fighting.own;
  assert.ok(room && own && Math.hypot(room.x - own.x, room.y - own.y) < 1e-9, 'the page and the room agree');
  assert.ok(Math.hypot(own.x - course.start.x, own.y - course.start.y) > 3, 'having walked and turned');
});

test('a drink pressed between two ticks reaches the rules on the next tick only, as the intent’s last number', () => {
  const door = startRoomDoor(compiled);
  door.open(course.start, course.blocks);
  const player = door.join();
  const drinks: number[] = [];
  const kept = new SnapshotKeeper();
  let fight: Fighting | null = null;
  const link: RoomLink = {
    player,
    dressed: [],
    joins: 1,
    rejoining: false,
    lost: null,
    send: (bytes) => {
      const input = Input.getRootAsInput(new flatbuffers.ByteBuffer(bytes));
      drinks.push(input.combat(input.combatLength() - 1) ?? -1);
      door.input(player, bytes);
    },
    pump: () => {
      door.tick();
      const message = wholeOf(kept, door.snapshot(player));
      if (message) fight?.receive(message);
    },
  };
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, link);
  fight = fighting;
  link.pump(TICK);
  const steps = fighting.steps(movement);
  fighting.press({ ...UNPRESSED, heal: true });
  for (let count = 0; count < 3; count += 1) {
    steps.step({} as Body, STILL);
    fighting.press(UNPRESSED);
    link.pump(TICK);
  }
  assert.deepEqual(drinks, [1, 0, 0]);
  assert.equal(fighting.own?.charges, 3, 'a player comes into the room with all three');
  assert.equal(fighting.own?.action.kind, 'idle', 'whole, the drink is refused');
});
