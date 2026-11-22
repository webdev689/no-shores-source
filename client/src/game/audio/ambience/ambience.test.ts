import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { SKY_NOW } from '../../../sky/skyDriver.ts';
import type { Landmass } from '../../landmass.ts';
import type { NodeInfo } from '../../worldData.ts';
import { Ambience } from './ambience.ts';
import { seeded } from './dsp.ts';
import { CROSSFADE_S } from './law.ts';
import { MOST_THUNDERS, ScapePlayer } from './player.ts';

/** An audio parameter that keeps the last value it was set toward. */
const param = () => {
  const kept = { value: 0 };
  const set = (value: number) => {
    kept.value = value;
    return kept;
  };
  return Object.assign(kept, {
    setValueAtTime: set,
    setTargetAtTime: set,
    linearRampToValueAtTime: set,
    exponentialRampToValueAtTime: set,
    cancelScheduledValues: () => kept,
  });
};

/** A node of any kind: it connects, plays and stops, and has every parameter the ambience sets. */
const node = (made: { count: number }) => {
  made.count++;
  const fake = {
    gain: param(),
    frequency: param(),
    playbackRate: param(),
    positionX: param(),
    positionY: param(),
    positionZ: param(),
    connect: (next: unknown) => next,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    addEventListener: () => undefined,
  };
  return fake;
};

/** A context of fake nodes, its time moved by hand. */
function fakeAudio() {
  const made = { count: 0 };
  const audio = {
    currentTime: 0,
    sampleRate: 8000,
    listener: {
      positionX: param(),
      positionY: param(),
      positionZ: param(),
      forwardX: param(),
      forwardY: param(),
      forwardZ: param(),
      upX: param(),
      upY: param(),
      upZ: param(),
    },
    createGain: () => node(made),
    createBiquadFilter: () => node(made),
    createPanner: () => node(made),
    createChannelMerger: () => node(made),
    createConvolver: () => node(made),
    createBufferSource: () => node(made),
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      length,
      sampleRate,
      numberOfChannels: channels,
      copyToChannel: () => undefined,
    }),
  };
  return { audio: audio as unknown as BaseAudioContext, made, out: node(made) as unknown as AudioNode };
}

const world = { continents: [{ id: 'continent-3', climate: 'woodland' }] };
const land = {
  heightAt: (x: number, y: number) => (y > 3000 ? -5 : 5),
  outline: [
    [-9000, -9000],
    [9000, -9000],
    [9000, 3000],
    [-9000, 3000],
  ],
  view: { rivers: [] },
  plan: null,
} as unknown as Landmass;
const patrol = { kind: 'patrol', continent: 'continent-3' } as NodeInfo;
const ear = { eye: [0, 0, 6.7] as const, yaw: 0 };

test('a place fades in over the crossfade, the next crossfades over it, and the last is let go once silent', () => {
  const fake = fakeAudio();
  let live = true;
  const ambience = new Ambience(world, () => (live ? fake : null), { random: seeded(9) });
  const step = (seconds: number, hear: () => void) => {
    for (let time = 0; time < seconds; time += 0.1) {
      hear();
      ambience.frame(0.1);
      (fake.audio as { currentTime: number }).currentTime += 0.1;
    }
  };
  step(1, () => ambience.onFoot(patrol, land, ear));
  assert.equal(ambience.stats.places, 1);
  step(CROSSFADE_S + 30, () => ambience.onFoot(patrol, land, ear));
  const voyage = { sailing: true, pace: 60, deck: true };
  step(CROSSFADE_S / 2, () => ambience.atSea(land, [0, 4000], ear, voyage, 0.1));
  assert.equal(ambience.stats.places, 2, 'the woods fade while the sea comes in');
  step(CROSSFADE_S + 0.5, () => ambience.atSea(land, [0, 4000], ear, voyage, 0.1));
  assert.equal(ambience.stats.places, 1, 'the woods let go once silent');
  step(CROSSFADE_S + 0.5, () => undefined);
  assert.equal(ambience.stats.places, 0, 'nothing heard behind a veil');
  step(1, () => ambience.onFoot(patrol, land, ear));
  live = false;
  step(0.2, () => ambience.onFoot(patrol, land, ear));
  assert.equal(ambience.stats.places, 0, 'silenced, it stops at once');
});

test('beds whose recordings have not come make no new nodes while they wait', (context) => {
  const fake = fakeAudio();
  // A page's own context, where recordings play, as Node has none.
  class PageAudio {}
  const kept = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { value: PageAudio, configurable: true });
  context.after(() =>
    kept ? Object.defineProperty(globalThis, 'AudioContext', kept) : Reflect.deleteProperty(globalThis, 'AudioContext'),
  );
  Object.setPrototypeOf(fake.audio, PageAudio.prototype);
  // The beds alone: a call's recording not come is asked for again only every few seconds, and let go at once.
  context.mock.method(ScapePlayer.prototype as unknown as { voiceTurn: () => void }, 'voiceTurn', () => undefined);
  const ambience = new Ambience(world, () => fake, { random: seeded(5) });
  const step = (seconds: number) => {
    for (let time = 0; time < seconds; time += 0.1) {
      ambience.onFoot(patrol, land, ear);
      ambience.frame(0.1);
      (fake.audio as { currentTime: number }).currentTime += 0.1;
    }
  };
  step(CROSSFADE_S + 2);
  const waiting = fake.made.count;
  step(20);
  assert.equal(fake.made.count, waiting, 'twenty seconds with no recording made nothing more');
});

test('each strike thunders once, as its sound arrives; a strike past hearing never does', (context) => {
  const thundered = mock.method(ScapePlayer.prototype, 'thunder', () => undefined);
  context.after(() => {
    thundered.mock.restore();
    SKY_NOW.current = { ...SKY_NOW.current, strikes: [], worldS: 0 };
  });
  const fake = fakeAudio();
  const ambience = new Ambience(world, () => fake, { random: seeded(3) });
  const strikes = [
    { x: 3430, y: 0, atS: 1000, toGround: true, power: 1 },
    { x: 30_000, y: 0, atS: 1000, toGround: true, power: 1 },
  ];
  for (let worldS = 1000; worldS < 1030; worldS += 0.1) {
    SKY_NOW.current = { ...SKY_NOW.current, strikes, worldS };
    ambience.onFoot(patrol, land, ear);
    ambience.frame(0.1);
    if (worldS < 1009.7) assert.equal(thundered.mock.callCount(), 0, `nothing heard yet at ${worldS}`);
  }
  assert.equal(thundered.mock.callCount(), 1);
  const [thunder] = thundered.mock.calls[0]?.arguments ?? [];
  assert.equal(thunder?.sound, 'thunder.roll');
});

test("the player's own steps are heard on its deck as they walk it, a step a stride, none in the air", (context) => {
  const stepped = mock.method(ScapePlayer.prototype, 'footstep', () => undefined);
  context.after(() => stepped.mock.restore());
  const fake = fakeAudio();
  const ambience = new Ambience(world, () => fake, { random: seeded(4) });
  const walk = (from: number, metres: number, mode: string) => {
    for (let walked = 0; walked <= metres; walked += 0.5) {
      const voyage = { sailing: true, pace: 60, deck: true, feet: { x: from + walked, y: 2, mode } };
      ambience.atSea(land, [0, 4000], ear, voyage, 0.1);
      ambience.frame(0.1);
    }
  };
  walk(0, 10, 'ground');
  assert.equal(stepped.mock.callCount(), 4, 'ten metres are four strides');
  walk(10, 10, 'air');
  assert.equal(stepped.mock.callCount(), 4, 'none while in the air');
  walk(500, 0, 'ground');
  assert.equal(stepped.mock.callCount(), 4, 'set down elsewhere, not walked');
});

test('in a dungeon none of the open air is heard: the island fades out and no strike thunders underground', (context) => {
  const thundered = mock.method(ScapePlayer.prototype, 'thunder', () => undefined);
  context.after(() => {
    thundered.mock.restore();
    SKY_NOW.current = { ...SKY_NOW.current, strikes: [], worldS: 0 };
  });
  const fake = fakeAudio();
  const ambience = new Ambience(world, () => fake, { random: seeded(6) });
  const step = (seconds: number, underground: boolean) => {
    for (let time = 0; time < seconds; time += 0.1) {
      ambience.onFoot(patrol, land, ear, [], underground);
      ambience.frame(0.1);
      (fake.audio as { currentTime: number }).currentTime += 0.1;
    }
  };
  step(1, false);
  assert.equal(ambience.stats.places, 1, 'the island heard on its land');
  SKY_NOW.current = {
    ...SKY_NOW.current,
    strikes: [{ x: 30, y: 0, atS: 1000, toGround: true, power: 1 }],
    worldS: 1000,
  };
  step(CROSSFADE_S + 30, true);
  assert.equal(ambience.stats.places, 0, 'nothing of the island underground');
  assert.equal(thundered.mock.callCount(), 0, 'a strike overhead is not heard');
});

test('a strike still on its way thunders though the strikes heard before it are let go', (context) => {
  const thundered = mock.method(ScapePlayer.prototype, 'thunder', () => undefined);
  context.after(() => {
    thundered.mock.restore();
    SKY_NOW.current = { ...SKY_NOW.current, strikes: [], worldS: 0 };
  });
  const fake = fakeAudio();
  const ambience = new Ambience(world, () => fake, { random: seeded(5) });
  const far = Array.from({ length: 100 }, (unused, nth) => ({ x: 30_000, y: nth, atS: 0, toGround: true, power: 1 }));
  const coming = { x: 10_000, y: 0, atS: 1, toGround: false, power: 1 };
  for (let worldS = 1; worldS < 40; worldS += 0.1) {
    SKY_NOW.current = { ...SKY_NOW.current, strikes: worldS < 1.5 ? [...far, coming] : [coming], worldS };
    ambience.onFoot(patrol, land, ear);
    ambience.frame(0.1);
  }
  assert.equal(thundered.mock.callCount(), 1);
});

test("a storm's thunder never takes the calls' room, and its rolls are held to a few at once", (context) => {
  // Each thunder's recording sounds, and stays sounding through the test.
  const played = mock.method(
    ScapePlayer.prototype as unknown as { recorded: (...args: unknown[]) => boolean },
    'recorded',
    (...args: unknown[]) => {
      (args[6] as { count: number }).count++;
      return true;
    },
  );
  context.after(() => played.mock.restore());
  const fake = fakeAudio();
  const calls = { count: 0 };
  const player = new ScapePlayer(fake.audio, fake.out, 'sea', seeded(4), calls);
  const heard = { ear: [0, 0, 2], origin: [0, 0, 0] } as unknown as Parameters<ScapePlayer['thunder']>[1];
  const thunder = (sound: 'thunder.roll' | 'thunder.crack') => {
    const before = played.mock.callCount();
    player.thunder({ sound, arrivesS: 0, gain: 0.3, corner: 2000, pitch: 1, toward: [1, 0] }, heard, 0);
    return played.mock.callCount() > before;
  };
  const rolled = Array.from({ length: 20 }, () => thunder('thunder.roll'));
  assert.equal(rolled.filter(Boolean).length, MOST_THUNDERS, 'a few rolls at once, the rest let pass');
  assert.equal(calls.count, 0, 'the calls keep all their room');
  assert.ok(thunder('thunder.crack'), 'a near crack comes through all the same');
});
