import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Landmass } from '../../landmass.ts';
import type { NodeInfo } from '../../worldData.ts';
import { Ambience } from './ambience.ts';
import { Bank } from './bank.ts';
import { seeded } from './dsp.ts';
import { CROSSFADE_S } from './law.ts';

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

// A page's buffers, as the bank makes them, in a test that has none.
Object.assign(globalThis, {
  AudioBuffer: class {
    readonly length: number;
    readonly sampleRate: number;
    readonly numberOfChannels = 1;
    constructor(shape: { length: number; sampleRate: number }) {
      [this.length, this.sampleRate] = [shape.length, shape.sampleRate];
    }
    get duration() {
      return this.length / this.sampleRate;
    }
    copyToChannel() {}
  },
});

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
  const ambience = new Ambience(world, () => (live ? fake : null), { random: seeded(9), bank: new Bank(() => null) });
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
  assert.ok(ambience.stats.sources > 0, 'the woods have their beds once made');
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
