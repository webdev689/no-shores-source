// The ambience's nodes: a place's room (its reverberation), a bed's way out (wide about the ear, or standing at a point
// through a panner), and a call's chain (its level, the air darkening it with distance, its panner, and its share of
// the room). Each chain lets its nodes go once it has sounded.

import { type Random, roomResponse } from './dsp.ts';
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

/** Each room's response by its sample rate, built once: the rooms are fixed, and building a long one takes tens of
 *  milliseconds, which a place made anew at each doorway of a Breach's run would pay with no veil to hide it. */
// shortcut: every room heard stays held (about 20 MB at 48 kHz if all are), let go only if rooms ever stop being fixed.
const RESPONSES = new WeakMap<Room, Map<number, readonly [Float32Array, Float32Array]>>();

/** A place's room: what is sent to it reverberates as the place does, into `out`. Answers the send. */
export function roomOf(audio: BaseAudioContext, room: Room, random: Random, out: AudioNode): GainNode {
  const byRate = RESPONSES.get(room) ?? new Map<number, readonly [Float32Array, Float32Array]>();
  RESPONSES.set(room, byRate);
  const response = byRate.get(audio.sampleRate) ?? roomResponse(audio.sampleRate, room, random);
  byRate.set(audio.sampleRate, response);
  const [left, right] = response;
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

/** A standing bed's share of the room. */
const BED_ROOM = 0.35;

/** Where a standing bed is heard from: a panner heard whole within `near` metres, falling off past it. */
function bedPanner(audio: BaseAudioContext, near: number): PannerNode {
  const panner = audio.createPanner();
  Object.assign(panner, {
    panningModel: 'equalpower',
    distanceModel: 'inverse',
    refDistance: near,
    maxDistance: 10000,
  });
  return panner;
}

/** A bed's way out: its level, then wide into `out`, or standing through a panner heard whole within `near` metres,
 *  with a little in the room. */
export function bedChain(
  audio: BaseAudioContext,
  how: { readonly standing: boolean; readonly near: number },
  out: AudioNode,
  send: AudioNode,
): { readonly level: GainNode; readonly panner: PannerNode | null } {
  const level = audio.createGain();
  level.gain.value = 0;
  if (!how.standing) {
    level.connect(out);
    return { level, panner: null };
  }
  const panner = bedPanner(audio, how.near);
  level.connect(panner).connect(out);
  const share = audio.createGain();
  share.gain.value = BED_ROOM;
  panner.connect(share).connect(send);
  return { level, panner };
}

/** Where and how a call sounds: its point and the ear's, the frame's origin, the distance it is heard whole at, when
 *  it starts, and its level. */
export interface CallShape {
  readonly point: Point3;
  readonly ear: Point3;
  readonly origin: readonly [number, number];
  readonly near: number;
  readonly when: number;
  readonly gain: number;
  /** Its top, Hz, where its own distance darkens it rather than the air's: thunder. */
  readonly corner?: number;
}

/** A call's chain: its level, the air, its panner, and its share of the room. Answers the node to play into, and a
 *  release for once it has sounded. */
export function callChain(
  audio: BaseAudioContext,
  shape: CallShape,
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
  [air.type, air.frequency.value] = ['lowpass', shape.corner ?? airCorner(distance)];
  const panner = audio.createPanner();
  Object.assign(panner, {
    panningModel: distance <= HRTF_WITHIN_M ? 'HRTF' : 'equalpower',
    distanceModel: 'inverse',
    refDistance: shape.near,
    maxDistance: 10000,
  });
  const [x, y, z] = toAudio(shape.point, shape.origin);
  for (const [param, value] of [
    [panner.positionX, x],
    [panner.positionY, y],
    [panner.positionZ, z],
  ] as const)
    param.setValueAtTime(value, shape.when);
  const share = audio.createGain();
  share.gain.value = roomShare(distance, shape.near);
  level.connect(air).connect(panner).connect(out);
  air.connect(share).connect(send);
  return { input: level, done: () => [level, air, panner, share].forEach((part) => part.disconnect()) };
}
