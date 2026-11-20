// The mission's one-shot sounds and the beds' spot sounds, each built from the shared noise buffers and a few
// oscillators, scheduled on the audio clock and disconnected once it has played, so nothing is left running.

import { type GullCall, gullCry, hit, thunderShape } from './ambienceShapes.ts';

/** What every voice is made from: the context, its noise made once, and the random source for variety. */
export interface Kit {
  readonly audio: AudioContext;
  readonly white: AudioBuffer;
  readonly brown: AudioBuffer;
  readonly crackle: AudioBuffer;
  readonly random: () => number;
}

type Points = readonly (readonly [number, number])[];
type FilterShape = {
  readonly type: BiquadFilterType;
  readonly frequency: number;
  readonly quality?: number;
  readonly sweep?: Points;
};

/** Lays an envelope's [seconds, value] points onto a parameter from `at`, scaled by `scale`. */
function shape(param: AudioParam, when: number, points: Points, scale = 1): void {
  param.cancelScheduledValues(when);
  param.setValueAtTime((points[0]?.[1] ?? 0) * scale, when);
  for (const [time, value] of points.slice(1)) param.linearRampToValueAtTime(value * scale, when + time);
}

/** Lets go of a voice's nodes once its source has ended. */
function releaseWhenDone(source: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
  source.addEventListener('ended', () => {
    for (const node of nodes) node.disconnect();
  });
}

const lengthOf = (points: Points): number => points.at(-1)?.[0] ?? 0;

/** A burst of noise through one filter (its frequency swept if asked), under an envelope. */
function noiseBurst(
  kit: Kit,
  destination: AudioNode,
  when: number,
  buffer: AudioBuffer,
  filter: FilterShape,
  points: Points,
) {
  const { audio } = kit;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const biquad = audio.createBiquadFilter();
  biquad.type = filter.type;
  biquad.frequency.value = filter.frequency;
  biquad.Q.value = filter.quality ?? 0.7;
  if (filter.sweep) shape(biquad.frequency, when, filter.sweep);
  const gain = audio.createGain();
  shape(gain.gain, when, points);
  source.connect(biquad).connect(gain).connect(destination);
  // A different stretch of the buffer each time, so no two bursts sound the same.
  source.start(when, kit.random() * buffer.duration * 0.9);
  source.stop(when + lengthOf(points) + 0.05);
  releaseWhenDone(source, [source, biquad, gain]);
}

/** An oscillator whose pitch follows `pitch` points, through an optional filter, under an envelope. */
function tone(
  kit: Kit,
  destination: AudioNode,
  when: number,
  type: OscillatorType,
  pitch: Points,
  points: Points,
  filter?: FilterShape,
) {
  const { audio } = kit;
  const oscillator = audio.createOscillator();
  oscillator.type = type;
  shape(oscillator.frequency, when, pitch);
  const gain = audio.createGain();
  shape(gain.gain, when, points);
  const nodes: AudioNode[] = [oscillator, gain];
  if (filter) {
    const biquad = audio.createBiquadFilter();
    biquad.type = filter.type;
    biquad.frequency.value = filter.frequency;
    biquad.Q.value = filter.quality ?? 0.7;
    oscillator.connect(biquad).connect(gain);
    nodes.push(biquad);
  } else oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(when);
  oscillator.stop(when + Math.max(lengthOf(points), lengthOf(pitch)) + 0.05);
  releaseWhenDone(oscillator, nodes);
}

/** A crack then a long roll, `distanceKm` away: later, quieter and duller the farther. */
export function thunderVoice(kit: Kit, destination: AudioNode, when: number, distanceKm: number): void {
  const thunder = thunderShape(distanceKm);
  const start = when + thunder.delayS;
  if (thunder.crack > 0) {
    // A tearing crack: a few ragged bursts of bright noise in the first fifth of a second.
    const points: [number, number][] = [[0, 0]];
    for (let tear = 0; tear < 5; tear++) {
      const time = 0.005 + tear * 0.035 + kit.random() * 0.01;
      points.push([time, thunder.crack * (1 - tear * 0.12)], [time + 0.02, thunder.crack * 0.25]);
    }
    points.push([0.5, 0]);
    const crack = { type: 'highpass', frequency: Math.min(thunder.brightnessHz, 2500) } as const;
    noiseBurst(
      kit,
      destination,
      start,
      kit.white,
      crack,
      points.map(([time, value]) => [time, value * 0.9 * thunder.gain]),
    );
  }
  // The roll: the strike's sound arriving from the near and the far ends of the bolt, in rumbles that die away.
  const roll: [number, number][] = [
    [0, 0],
    [0.12, thunder.gain * 2],
  ];
  const rumbles = 3 + Math.floor(kit.random() * 3);
  for (let rumble = 1; rumble <= rumbles; rumble++) {
    const time = (thunder.rollS * rumble) / (rumbles + 1);
    const fall = Math.exp((-2.5 * time) / thunder.rollS);
    roll.push([time - 0.15, thunder.gain * fall * 1.1], [time, thunder.gain * fall * (1.4 + kit.random() * 0.6)]);
  }
  roll.push([thunder.rollS, 0]);
  const rollFilter = { type: 'lowpass', frequency: thunder.brightnessHz, quality: 0.5 } as const;
  noiseBurst(kit, destination, start, kit.brown, rollFilter, roll);
}

/** Two hulls meeting: timber splitting, a deep boom, debris falling after. */
export function crashVoice(kit: Kit, destination: AudioNode, when: number): void {
  const split: [number, number][] = [[0, 0]];
  for (let snap = 0; snap < 12; snap++) {
    const time = 0.01 + snap * 0.06 + kit.random() * 0.03;
    split.push([time, 0.9 * Math.exp(-snap / 5)], [time + 0.025, 0.15 * Math.exp(-snap / 5)]);
  }
  split.push([0.95, 0]);
  noiseBurst(kit, destination, when, kit.white, { type: 'bandpass', frequency: 1400, quality: 1.6 }, split);
  tone(
    kit,
    destination,
    when,
    'sine',
    [
      [0, 70],
      [1.2, 30],
    ],
    hit(0.005, 2.2, 1),
  );
  noiseBurst(kit, destination, when, kit.brown, { type: 'lowpass', frequency: 260 }, hit(0.01, 1.8, 0.9));
  for (let piece = 0; piece < 12; piece++) {
    const time = 0.6 + kit.random() * 3;
    const filter = { type: 'bandpass', frequency: 400 + kit.random() * 2200, quality: 2 } as const;
    noiseBurst(
      kit,
      destination,
      when + time,
      kit.white,
      filter,
      hit(0.002, 0.06 + kit.random() * 0.15, 0.15 + kit.random() * 0.35),
    );
  }
}

/** Something into the sea: `size` 0 a dropped plank to 1 a body overboard. */
export function splashVoice(kit: Kit, destination: AudioNode, when: number, size: number): void {
  const length = 0.25 + size * 1.1;
  const sweep: Points = [
    [0, 2600],
    [length, 2600 - 1900 * size],
  ];
  noiseBurst(
    kit,
    destination,
    when,
    kit.white,
    { type: 'bandpass', frequency: 2600, quality: 0.8, sweep },
    hit(0.01, length, 0.45 + 0.25 * size),
  );
  if (size > 0.3)
    noiseBurst(
      kit,
      destination,
      when,
      kit.brown,
      { type: 'lowpass', frequency: 350 },
      hit(0.02, length * 0.7, size * 0.7),
    );
}

/** A body hitting the deck. */
export function thudVoice(kit: Kit, destination: AudioNode, when: number): void {
  tone(
    kit,
    destination,
    when,
    'sine',
    [
      [0, 85],
      [0.3, 40],
    ],
    hit(0.003, 0.35, 0.8),
  );
  noiseBurst(kit, destination, when, kit.brown, { type: 'lowpass', frequency: 500 }, hit(0.003, 0.18, 0.6));
}

/** The ears ringing after the blow: a high, faintly beating tone fading over `seconds`. */
export function ringingVoice(kit: Kit, destination: AudioNode, when: number, seconds: number): void {
  const length = Math.max(0.5, seconds);
  tone(kit, destination, when, 'sine', [[0, 3800]], hit(0.08, length, 0.07));
  tone(kit, destination, when, 'sine', [[0, 3867]], hit(0.08, length, 0.04));
}

/** One heartbeat: the two beats, the second softer. */
export function heartbeatVoice(kit: Kit, destination: AudioNode, when: number): void {
  for (const [offset, peak] of [
    [0, 0.6],
    [0.28, 0.42],
  ] as const)
    tone(
      kit,
      destination,
      when + offset,
      'sine',
      [
        [0, 60],
        [0.15, 38],
      ],
      hit(0.01, 0.2, peak),
      { type: 'lowpass', frequency: 200 },
    );
}

/** The bright flash in the deep: glassy partials swelling and rising an octave, with a shimmer above them. */
export function flashVoice(kit: Kit, destination: AudioNode, when: number): void {
  const swell: Points = [
    [0, 0],
    [2.2, 1],
    [2.6, 0.6],
    [3.6, 0],
  ];
  for (const [index, partial] of [440, 660, 880, 1320, 1760, 2640].entries()) {
    const level = 0.09 / (1 + index * 0.4);
    const detune = 1 + (kit.random() - 0.5) * 0.004;
    tone(
      kit,
      destination,
      when,
      'sine',
      [
        [0, partial * detune],
        [2.4, partial * 2 * detune],
        [3.6, partial * 2 * detune],
      ],
      swell.map(([time, value]) => [time, value * level]),
    );
  }
  const shimmer = {
    type: 'highpass',
    frequency: 5000,
    sweep: [
      [0, 3000],
      [2.4, 9000],
    ] as Points,
  } as const;
  noiseBurst(
    kit,
    destination,
    when,
    kit.white,
    shimmer,
    swell.map(([time, value]) => [time, value * 0.03]),
  );
}

/** A fast camera move: air rushing past, rising and falling. */
export function whooshVoice(kit: Kit, destination: AudioNode, when: number): void {
  const sweep: Points = [
    [0, 300],
    [0.35, 2400],
    [0.8, 450],
  ];
  const points: Points = [
    [0, 0],
    [0.35, 0.9],
    [0.8, 0],
  ];
  noiseBurst(kit, destination, when, kit.white, { type: 'bandpass', frequency: 300, quality: 1.4, sweep }, points);
}

/** A gull crying somewhere over the water: nearer is louder and brighter, each bird to one side or the other. */
export function gullVoice(kit: Kit, destination: AudioNode, when: number): void {
  const { audio } = kit;
  const cry = gullCry(kit.random);
  const pan = audio.createStereoPanner();
  pan.pan.value = (kit.random() - 0.5) * 1.6;
  pan.connect(destination);
  const loud = 0.35 * (1.2 - cry.distance);
  const dull = { type: 'lowpass', frequency: 9000 - 6500 * cry.distance } as const;
  const pitch = (call: GullCall): Points => [
    [call.startS, call.fromHz],
    [call.startS + call.durationS * 0.3, call.peakHz],
    [call.startS + call.durationS, call.toHz],
  ];
  const level = (call: GullCall): Points => [
    [call.startS, 0],
    [call.startS + 0.02, loud],
    [call.startS + call.durationS * 0.7, loud * 0.8],
    [call.startS + call.durationS, 0],
  ];
  for (const call of cry.calls)
    tone(kit, pan, when, 'sawtooth', [[0, call.fromHz], ...pitch(call)], [[0, 0], ...level(call)], dull);
  const ends = cry.calls.at(-1);
  disconnectAfter(kit, when + (ends ? ends.startS + ends.durationS : 0) + 0.1, [pan]);
}

/** Disconnects nodes shared by several voices once they are all done, by a silent source ending on the clock. */
export function disconnectAfter(kit: Kit, when: number, nodes: readonly AudioNode[]): void {
  const marker = kit.audio.createConstantSource();
  marker.offset.value = 0;
  marker.start(when);
  marker.stop(when);
  releaseWhenDone(marker, [marker, ...nodes]);
}

/** A ship's timbers working: a slow stick-slip grind through a hollow resonance. */
export function creakVoice(kit: Kit, destination: AudioNode, when: number): void {
  const length = 0.6 + kit.random() * 1;
  const rate = 25 + kit.random() * 20;
  const points: Points = [
    [0, 0],
    [length * 0.3, 0.3],
    [length * 0.75, 0.24],
    [length, 0],
  ];
  const resonance = { type: 'bandpass', frequency: 500 + kit.random() * 500, quality: 6 } as const;
  tone(
    kit,
    destination,
    when,
    'sawtooth',
    [
      [0, rate],
      [length, rate * (1.3 + kit.random() * 0.6)],
    ],
    points,
    resonance,
  );
}

/** A wave breaking against the hull. */
export function breakVoice(kit: Kit, destination: AudioNode, when: number): void {
  const sweep: Points = [
    [0, 700],
    [0.5, 2800],
    [2.3, 900],
  ];
  const points: Points = [
    [0, 0],
    [0.5, 0.35],
    [1, 0.22],
    [2.3, 0],
  ];
  noiseBurst(kit, destination, when, kit.white, { type: 'lowpass', frequency: 700, sweep }, points);
}

/** A pop in the blaze: a knot of sap bursting. */
export function popVoice(kit: Kit, destination: AudioNode, when: number): void {
  noiseBurst(
    kit,
    destination,
    when,
    kit.white,
    { type: 'highpass', frequency: 900 },
    hit(0.001, 0.05 + kit.random() * 0.06, 0.5),
  );
}

/** A slow groan of the deep: the wreck's timbers or the sea itself, felt more than heard. */
export function groanVoice(kit: Kit, destination: AudioNode, when: number): void {
  const length = 3 + kit.random() * 2;
  const pitch = 40 + kit.random() * 15;
  const points: Points = [
    [0, 0],
    [length * 0.35, 0.4],
    [length * 0.6, 0.3],
    [length, 0],
  ];
  tone(
    kit,
    destination,
    when,
    'sawtooth',
    [
      [0, pitch],
      [length, pitch * 0.75],
    ],
    points,
    { type: 'lowpass', frequency: 200, quality: 3 },
  );
}
