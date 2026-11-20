// The ambience's nodes: a place's room (its reverberation), a bed's emitter (wide about the ear, or standing at a point
// through a panner), and a call's chain (its level, the air darkening it with distance, its panner, and its share of
// the room). Each chain lets its nodes go once it has sounded.

import { type Random, between, roomResponse } from './dsp.ts';
import { BREAKER_S } from './law.ts';
import type { Point3 } from './places.ts';
import type { Room } from './scapes.ts';

/** A world point (east, south, up) as the listener's frame has it (x east, y up, z south), from the frame's origin. */
export const toAudio = (point: Point3, origin: readonly [number, number]): readonly [number, number, number] => [
  point[0] - origin[0],
  point[2],
  point[1] - origin[1],
];

/** The air's darkening of a call `distance` metres off: its top falls from 22 kHz near to 1.2 kHz far. */
export const airCorner = (distance: number): number => Math.max(1200, 22000 / (1 + Math.max(0, distance) / 120));
/** A call this near is placed by the ear's own shape (HRTF), above and behind as well as aside; a farther one is only
 *  panned, which is all a far call needs and costs far less. */
const HRTF_WITHIN_M = 60;
/** A call's share of the room by its distance: whole within `near`, then falling as the root of its distance, so a
 *  far call is heard more by its echo than by itself, as it is out of doors. */
export const roomShare = (distance: number, near: number): number =>
  Math.min(1, Math.sqrt(near / Math.max(near, distance)));

/** A place's room: what is sent to it reverberates as the place does, into `out`. Answers the send. */
export function roomOf(audio: BaseAudioContext, room: Room, random: Random, out: AudioNode): GainNode {
  const [left, right] = roomResponse(audio.sampleRate, room, random);
  const buffer = audio.createBuffer(2, left.length, audio.sampleRate);
  buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
  const convolver = audio.createConvolver();
  convolver.normalize = false;
  convolver.buffer = buffer;
  const send = audio.createGain();
  send.gain.value = room.send;
  send.connect(convolver).connect(out);
  return send;
}

/** A bed's emitter: its sources, its gain, its tone where gusts open its top, its panner where it stands at a point,
 *  and a shore's breaker clock. */
export interface Emitter {
  readonly sources: AudioBufferSourceNode[];
  readonly gain: GainNode;
  readonly tone: BiquadFilterNode | null;
  readonly panner: PannerNode | null;
  point: Point3 | null;
  wave: number;
  period: number;
}

/** A standing bed's share of the room. */
const BED_ROOM = 0.35;

/** A bed's emitter: wide, two plays of its loop half a loop apart, one to each ear; or one play standing at a point
 *  through a panner, heard whole within `near` metres, a little of it in the room. A gusty bed's top is opened and closed by `tone`. */
export function emitterOf(
  audio: BaseAudioContext,
  buffer: AudioBuffer,
  how: { readonly standing: boolean; readonly gusty: boolean; readonly near: number },
  random: Random,
  out: AudioNode,
  send: AudioNode,
): Emitter {
  const gain = audio.createGain();
  gain.gain.value = 0;
  const start = audio.currentTime + 0.02;
  const source = (offset: number) => {
    const played = audio.createBufferSource();
    [played.buffer, played.loop] = [buffer, true];
    played.start(start, offset * buffer.duration);
    return played;
  };
  const tone = how.gusty ? audio.createBiquadFilter() : null;
  if (tone) [tone.type, tone.frequency.value] = ['lowpass', 4000];
  const into = tone ?? gain;
  if (tone) tone.connect(gain);
  if (how.standing) {
    const panner = audio.createPanner();
    Object.assign(panner, {
      panningModel: 'equalpower',
      distanceModel: 'inverse',
      refDistance: how.near,
      maxDistance: 10000,
    });
    const played = source(random());
    played.connect(into);
    gain.connect(panner).connect(out);
    const share = audio.createGain();
    share.gain.value = BED_ROOM;
    panner.connect(share).connect(send);
    return {
      sources: [played],
      gain,
      tone,
      panner,
      point: null,
      wave: random() * 8,
      period: between(random, BREAKER_S),
    };
  }
  const merger = audio.createChannelMerger(2);
  const offset = random();
  const [left, right] = [source(offset), source((offset + 0.5) % 1)];
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  merger.connect(into);
  gain.connect(out);
  return { sources: [left, right], gain, tone, panner: null, point: null, wave: 0, period: 1 };
}

/** Lets an emitter go, faded over `fade` seconds first where it may still sound. */
export function release(audio: BaseAudioContext, emitter: Emitter, fade = 0): void {
  const now = audio.currentTime;
  if (fade > 0) emitter.gain.gain.setTargetAtTime(0, now, fade / 5);
  for (const source of emitter.sources) source.stop(now + fade);
  emitter.sources[0]?.addEventListener('ended', () =>
    [...emitter.sources, emitter.tone, emitter.gain, emitter.panner].forEach((part) => part?.disconnect()),
  );
}

/** Where and how a call sounds: its point and the ear's, the frame's origin, the distance it is heard whole at, when
 *  it starts, how far it drifts a second and for how long, and its level. */
export interface CallShape {
  readonly point: Point3;
  readonly ear: Point3;
  readonly origin: readonly [number, number];
  readonly near: number;
  readonly when: number;
  readonly drift: number;
  readonly seconds: number;
  readonly gain: number;
}

/** A call's chain: its level, the air, its panner (a drifting call's moves over its seconds), and its share of the
 *  room. Answers the node to play into, and a release for once it has sounded. */
export function callChain(
  audio: BaseAudioContext,
  shape: CallShape,
  random: Random,
  out: AudioNode,
  send: AudioNode,
): { readonly input: GainNode; readonly done: () => void } {
  const distance = Math.hypot(
    shape.point[0] - shape.ear[0],
    shape.point[1] - shape.ear[1],
    shape.point[2] - shape.ear[2],
  );
  const level = audio.createGain();
  level.gain.value = shape.gain;
  const air = audio.createBiquadFilter();
  [air.type, air.frequency.value] = ['lowpass', airCorner(distance)];
  const panner = audio.createPanner();
  Object.assign(panner, {
    panningModel: distance <= HRTF_WITHIN_M ? 'HRTF' : 'equalpower',
    distanceModel: 'inverse',
    refDistance: shape.near,
    maxDistance: 10000,
  });
  const [x, y, z] = toAudio(shape.point, shape.origin);
  const bearing = random() * 2 * Math.PI;
  const travel = shape.drift * shape.seconds;
  for (const [param, from, change] of [
    [panner.positionX, x, Math.sin(bearing) * travel],
    [panner.positionY, y, 0],
    [panner.positionZ, z, Math.cos(bearing) * travel],
  ] as const) {
    param.setValueAtTime(from, shape.when);
    if (change !== 0) param.linearRampToValueAtTime(from + change, shape.when + shape.seconds);
  }
  const share = audio.createGain();
  share.gain.value = roomShare(distance, shape.near);
  level.connect(air).connect(panner).connect(out);
  air.connect(share).connect(send);
  return { input: level, done: () => [level, air, panner, share].forEach((part) => part.disconnect()) };
}
