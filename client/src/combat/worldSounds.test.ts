import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent, SeenPlayer } from '../network/messages.ts';
import { plainDress } from '../player/dressing.ts';
import type { FighterView } from '../rules/fighters.ts';
import { EVENT } from './cues.ts';
import type { KeptFoe } from './fighting.ts';
import { SpellEffects } from './spellEffects.ts';
import { HEARD_MOST_S, type HeardFight, type WorldFrame, WorldSounds, voiceToDrop } from './worldSounds.ts';
import { listen } from '../listener.ts';

const SWORD = 2;
const PLAYER = 1;
const FOE = 7;

const view = (over: Partial<FighterView> = {}): FighterView => ({
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: SWORD,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 10,
  poiseMax: 10,
  target: null,
  action: { kind: 'idle' },
  ...over,
});

const foeAt = (x: number, over: Partial<KeptFoe> = {}): KeptFoe => ({
  id: FOE,
  kind: 0,
  type: 1,
  rank: 1,
  faction: 1,
  phase: 0,
  alert: 0,
  level: 0,
  shield: null,
  view: view({ x, side: 'foes', arms: 0 }),
  before: null,
  ticks: 1,
  ...over,
});

/** A page's frame with the player at the origin and one foe `x` metres east. */
function frameOf(over: { own?: FighterView; foe?: KeptFoe; events?: FightEvent[]; quiet?: boolean } = {}): WorldFrame {
  const fight: HeardFight = {
    player: PLAYER,
    own: over.own ?? view(),
    others: new Map(),
    foes: new Map([[FOE, over.foe ?? foeAt(5)]]),
    spells: new SpellEffects(),
    shots: [],
    castSent: null,
    standing: { kind: 'inside' },
  };
  return {
    seconds: 1 / 60,
    quiet: over.quiet ?? false,
    fight,
    events: over.events ?? [],
    shots: { fired: [], struck: [] },
    eye: [0, 3, 2],
    yaw: 0,
    walker: { feet: [0, 0, 0], walked: 0, drawn: true, mounted: false, look: 0, pulled: false },
    others: new Map(),
    foes: new Map(),
    ground: { blocks: [] },
    landed: [],
    crates: null,
  };
}

/** A page's sound faked: every panner and the listener keep where they were set, and every cue played is listed. */
function fakeSound() {
  const param = () => ({ value: 0 });
  const place = () => ({ positionX: param(), positionY: param(), positionZ: param() });
  const listener = { ...place(), forwardX: param(), forwardY: param(), forwardZ: param(), ...place() };
  Object.assign(listener, { upX: param(), upY: param(), upZ: param() });
  const faded: { at: number; to: number }[] = [];
  const audio = {
    listener,
    currentTime: 10,
    createPanner: () => ({ ...place(), connect: () => undefined, disconnect: () => undefined }),
    createGain: () => {
      const gain = {
        to: null as unknown,
        gain: {
          setValueAtTime: (to: number, when: number) => void faded.push({ at: when, to }),
          linearRampToValueAtTime: (to: number, when: number) => void faded.push({ at: when, to }),
        },
        connect: (to: unknown) => void (gain.to = to),
        disconnect: () => undefined,
      };
      return gain;
    },
  } as unknown as AudioContext;
  const played: { id: string; rate: number; at: readonly number[]; until: number | null }[] = [];
  const stopped: string[] = [];
  const play = (_audio: AudioContext, out: AudioNode, id: string, rate: number) => {
    const panner = ((out as unknown as { to?: unknown }).to ?? out) as ReturnType<typeof place>;
    const one = { id, rate, at: [panner.positionX.value, panner.positionY.value, panner.positionZ.value], until: null };
    played.push(one);
    const source = {
      stop: (when?: number) => (when === undefined ? stopped.push(id) : void (one.until = when as never)),
      addEventListener: () => undefined,
    };
    return source as unknown as AudioBufferSourceNode;
  };
  return { output: { audio, out: {} as AudioNode }, play, played, stopped, listener, faded };
}

const hit = (over: Partial<FightEvent> = {}): FightEvent => ({
  tick: 1n,
  kind: EVENT.hit,
  how: 1,
  striker: PLAYER,
  defender: FOE,
  amount: 10,
  stroke: 1,
  ...over,
});

test("the player's sword cuts a foe where the foe stands, the listener at the eye facing its yaw", () => {
  const { output, play, played, listener } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  sounds.frame(frameOf({ events: [hit()] }));
  assert.deepEqual(
    played.map(({ id, at }) => [id, at]),
    [['hit.blade', [5, 0, 0]]],
    "east, up and south are the listener's x, y and z",
  );
  const rate = played[0]?.rate ?? 0;
  assert.ok(rate !== 1 && Math.abs(rate - 1) <= 0.04, 'a blow strays a little in pitch');
  assert.deepEqual([listener.positionX.value, listener.positionY.value, listener.positionZ.value], [0, 2, 3]);
  assert.deepEqual([listener.forwardX.value, listener.forwardZ.value], [0, -1], 'yaw 0 looks north');
});

test("at sea the ambience counts the listener's frame from the player's ship: a blow is placed in that frame, by the ear", () => {
  const { output, play, played, listener } = fakeSound();
  const ship = [-500, 700] as const;
  // The ambience hears the sea round the player's ship each frame, the eye as its ear, before and after the fight's sounds.
  listen(output.audio, [0, 3, 2], 0, ship);
  const sounds = new WorldSounds(() => output, play);
  sounds.frame(frameOf({ events: [hit()] }));
  listen(output.audio, [0, 3, 2], 0, ship);
  assert.deepEqual(
    played.map((sound) => sound.at),
    [[505, 0, -700]],
  );
  assert.deepEqual([listener.positionX.value, listener.positionY.value, listener.positionZ.value], [500, 2, -697]);
});

test("a swing's whoosh as its rush meets the blow, once; nothing for what a figure first seen was already doing", () => {
  const { output, play, played } = fakeSound();
  // The whoosh's rush comes 2 ticks into it: a blow landing on tick 8 is heard from tick 6.
  const sounds = new WorldSounds(
    () => output,
    play,
    () => 2 / 60,
  );
  const attack = (elapsed: number) =>
    view({ action: { kind: 'attack', stroke: 1, elapsed, strike: 8, end: 16, swing: 'plain', leftHand: false } });
  sounds.frame(frameOf({ own: attack(7) }));
  sounds.frame(frameOf({ own: view() }));
  sounds.frame(frameOf({ own: attack(0) }));
  sounds.frame(frameOf({ own: attack(5) }));
  assert.deepEqual(played, [], 'not while it is raised');
  sounds.frame(frameOf({ own: attack(6) }));
  sounds.frame(frameOf({ own: attack(7) }));
  assert.deepEqual(
    played.map(({ id }) => id),
    ['swing.light'],
  );
});

test('a menu holds the world quiet, and what happened meanwhile is not heard after', () => {
  const { output, play, played } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  sounds.frame(frameOf({ quiet: true }));
  sounds.frame(frameOf({ quiet: true, events: [hit()], foe: foeAt(5, { alert: 2 }) }));
  sounds.frame(frameOf({ foe: foeAt(5, { alert: 2 }) }));
  assert.deepEqual(played, []);
  sounds.frame(frameOf({ foe: foeAt(5, { alert: 0 }) }));
  sounds.frame(frameOf({ foe: foeAt(5, { alert: 2 }) }));
  assert.deepEqual(
    played.map(({ id }) => id),
    ['foe.alert'],
  );
});

test("one fighting on the players' side turning alert is no foe noticing them", () => {
  const { output, play, played } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  const ally = (alert: number) => foeAt(5, { alert, view: view({ x: 5, side: 'players' }) });
  sounds.frame(frameOf({ foe: ally(0) }));
  sounds.frame(frameOf({ foe: ally(2) }));
  assert.deepEqual(played, []);
});

test('nothing sounds before the page has sound, nor farther off than 40 m', () => {
  const { output, play, played } = fakeSound();
  new WorldSounds(() => null, play).frame(frameOf({ events: [hit()] }));
  new WorldSounds(() => output, play).frame(frameOf({ foe: foeAt(45), events: [hit()] }));
  assert.deepEqual(played, []);
});

test('an unpicked cue plays nothing and takes no voice', () => {
  const { output } = fakeSound();
  let asked = 0;
  const sounds = new WorldSounds(
    () => output,
    () => ((asked += 1), null),
  );
  sounds.frame(frameOf({ events: [hit()] }));
  assert.equal(asked, 1);
});

test('at most sixteen sounds at once: the farthest gives way to a nearer one, a farther one is not heard', () => {
  const { output, play, played, stopped } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  const landed = Array.from({ length: 20 }, (unused, index) => [20 - index, 3, 2] as const);
  sounds.frame({ ...frameOf(), landed });
  assert.equal(played.length, 20);
  assert.equal(stopped.length, 4, 'the four farthest stopped for nearer ones');
  sounds.frame({ ...frameOf(), landed: [[30, 3, 2]] });
  assert.equal(played.length, 20, 'a farther one waits for none');
  assert.equal(voiceToDrop([1, 9, 4], 5, 3), 1);
  assert.equal(voiceToDrop([1, 9, 4], 10, 3), 'new');
  assert.equal(voiceToDrop([1, 9], 10, 3), null);
});

test("a cue heard where something else happened plays at its own pitch where it has one, a Breach's bell's note", () => {
  const { output, play, played } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  const bell = { cue: 'element.cosmic', at: [1, 3, 2] as const, rate: 1.5 };
  sounds.frame({ ...frameOf(), heard: [bell, { cue: 'story.crash', at: [1, 3, 2] }] });
  assert.deepEqual(
    played.map((one) => [one.id, one.rate]),
    [
      ['element.cosmic', 1.5],
      ['story.crash', 1],
    ],
  );
});

test("a public event's cue holds its voice a few seconds at most, fading out; a fight's plays out", () => {
  const { output, play, played, faded } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  sounds.frame({ ...frameOf({ events: [hit()] }), heard: [{ cue: 'story.crash', at: [1, 3, 2] }] });
  const heard = played.find((one) => one.id === 'story.crash');
  assert.equal(heard?.until, 10 + HEARD_MOST_S, 'stopped once its most is up');
  assert.deepEqual(faded, [
    { at: 10 + HEARD_MOST_S - 0.5, to: 1 },
    { at: 10 + HEARD_MOST_S, to: 0 },
  ]);
  assert.ok(
    played.some((one) => one.id !== 'story.crash' && one.until === null),
    "the blow's own is not cut",
  );
});

test("a cue heard whole (a Breach's toll, its far bells) plays out and carries farther than the others", () => {
  const { output, play, played } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  const far = [100, 3, 2] as const;
  sounds.frame({
    ...frameOf(),
    heard: [
      { cue: 'breach.toll', at: far, whole: true },
      { cue: 'story.crash', at: far },
    ],
  });
  assert.deepEqual(
    played.map((one) => [one.id, one.until]),
    [['breach.toll', null]],
    'the toll whole, the other crash too far',
  );
});

test('a cue heard whole ranks as near among sixteen voices: a far bell is heard over nearer swings, and stays', () => {
  const { output, play, played, stopped } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  const near = Array.from({ length: 16 }, (unused, index) => [index + 1, 3, 2] as const);
  sounds.frame({ ...frameOf(), landed: near });
  sounds.frame({ ...frameOf(), heard: [{ cue: 'breach.bell.wake', at: [60, 3, 2], whole: true }] });
  assert.ok(
    played.some((one) => one.id === 'breach.bell.wake'),
    'the far bell is heard',
  );
  assert.deepEqual(stopped, ['drop.land'], 'the farthest landing gave way');
  sounds.frame({ ...frameOf(), landed: [[0.5, 3, 2]] });
  assert.deepEqual(stopped, ['drop.land', 'drop.land'], "a nearer one takes a landing's place, not the bell's");
});

test("another rider's boost is heard as it begins, from their body as the room last stepped it", () => {
  const { output, play, played } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  const dress = plainDress('human', 0.5);
  const rider = { id: 5, x: 2, y: 3, z: 0, facing: 0, dress, anim: 'horsewalk', frame: null, spin: false };
  const body = {
    x: 2,
    y: 3,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 0,
    mode: 'ground',
    crouched: false,
    crouch: 0,
  } as const;
  const seen = (boosting: number): SeenPlayer => ({
    player: 5,
    acknowledged: 0,
    body: { ...body, grounded: 1, over: null, lip: 0, moving: false, boosting },
    fighter: null,
    standing: { kind: 'inside' },
    anim: 'horsewalk',
    frame: 0,
    facing: 0,
  });
  const riding = (boosting: number): WorldFrame => {
    const frame = frameOf();
    return {
      ...frame,
      fight: { ...frame.fight, others: new Map([[5, seen(boosting)]]) },
      others: new Map([[5, rider]]),
    };
  };
  for (const boosting of [0, 0, 4, 3.9]) sounds.frame(riding(boosting));
  assert.equal(played.filter((one) => one.id === 'horse.boost').length, 1);
});

test("the player's own hit foreseen is heard as it lands, and the room's word on it is not heard again", () => {
  const { output, play, played } = fakeSound();
  const sounds = new WorldSounds(() => output, play);
  sounds.frame({ ...frameOf({ events: [] }), foreseen: [hit()] });
  assert.deepEqual(
    played.map(({ id }) => id),
    ['hit.blade'],
    'as it lands',
  );
  sounds.frame(frameOf({ events: [hit({ felt: true })] }));
  assert.equal(played.length, 1, "nothing more on the room's word");
});
