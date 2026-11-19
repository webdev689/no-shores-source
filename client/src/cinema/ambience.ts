// The sea's and the storm's ambience for the prologue's cutscenes: seven looping beds (rain, wind, waves, fire, the
// deep, gulls, creaking timbers) that glide to the levels a scene asks for, the spot sounds that ride on them, and the
// mission's one-shots. All of it is synthesised (noise, filters, oscillators), none recorded. Nothing plays until the
// game's world output answers, and the output may come and go: the levels keep gliding meanwhile, and the sound picks
// up where they stand once it returns.

import {
  brownNoise,
  clampLevel,
  crackle,
  glided,
  nextGapS,
  seamlessLoop,
  seededRandom,
  whiteNoise,
} from './ambienceShapes.ts';
import {
  breakVoice,
  crashVoice,
  creakVoice,
  flashVoice,
  groanVoice,
  gullVoice,
  heartbeatVoice,
  type Kit,
  popVoice,
  ringingVoice,
  splashVoice,
  thudVoice,
  thunderVoice,
  whooshVoice,
} from './ambienceVoices.ts';

/** Where the world's sounds play; the game passes uiSounds' worldOutput. Null while there is no sound. */
export type SoundOut = () => { readonly audio: AudioContext; readonly out: AudioNode } | null;

/** Each bed's level, 0 silent to 1 full. */
export interface AmbienceLevels {
  rain: number;
  wind: number;
  waves: number;
  fire: number;
  deep: number;
  gulls: number;
  creak: number;
}

type Bed = keyof AmbienceLevels;
const BEDS: readonly Bed[] = ['rain', 'wind', 'waves', 'fire', 'deep', 'gulls', 'creak'];

/** Each bed's gain at level 1, set by ear and by the rendered checks so the storm's rain is the loudest bed. */
const BED_GAIN: Readonly<Record<Bed, number>> = {
  rain: 0.22,
  wind: 2.4,
  waves: 0.33,
  fire: 0.23,
  deep: 0.18,
  gulls: 1.2,
  creak: 3,
};

/** The spot sounds that ride on a bed, and their mean gap at the bed's full level, in seconds. */
const SPOTS: readonly { readonly bed: Bed; readonly meanGapS: number; readonly voice: typeof gullVoice }[] = [
  { bed: 'gulls', meanGapS: 1.6, voice: gullVoice },
  { bed: 'creak', meanGapS: 2.2, voice: creakVoice },
  { bed: 'waves', meanGapS: 3.5, voice: breakVoice },
  { bed: 'fire', meanGapS: 0.7, voice: popVoice },
  { bed: 'deep', meanGapS: 5, voice: groanVoice },
];

/** A gain written to the audio clock eases to it over this time constant, so no level change clicks. */
const EASE_S = 0.04;
/** The one-shots' level against the beds: the crash is the loudest thing in the mission. */
const SHOTS_GAIN = 0.55;
/** A heartbeat at a frightened 75 a minute. */
const BEAT_S = 60 / 75;
const SEED = 0x5a17;

interface Glide {
  from: number;
  to: number;
  elapsedS: number;
  glideS: number;
  value: number;
}

interface BedGraph {
  readonly gain: GainNode;
  readonly sources: readonly AudioScheduledSourceNode[];
  readonly nodes: readonly AudioNode[];
}

interface Engine {
  readonly kit: Kit;
  readonly out: AudioNode;
  readonly master: GainNode;
  readonly shots: GainNode;
  readonly beds: Map<Bed, BedGraph>;
}

/** The noise buffers, made once for each context and shared by every bed and voice. */
const kits = new WeakMap<BaseAudioContext, Omit<Kit, 'random'>>();

function bufferOf(audio: BaseAudioContext, samples: Float32Array<ArrayBuffer>): AudioBuffer {
  const buffer = audio.createBuffer(1, samples.length, audio.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

function kitFor(audio: AudioContext, random: () => number): Kit {
  let made = kits.get(audio);
  if (!made) {
    const rate = audio.sampleRate;
    const noiseRandom = seededRandom(SEED);
    // Four seconds of noise, long enough that its loop is never heard, folded so it has no seam.
    const loop = (samples: Float32Array<ArrayBuffer>) => bufferOf(audio, seamlessLoop(samples, Math.round(rate * 0.25)));
    made = { audio, white: loop(whiteNoise(rate * 4, noiseRandom)), brown: loop(brownNoise(rate * 4, noiseRandom)) };
    kits.set(audio, made);
  }
  return { ...made, random };
}

export class Ambience {
  private readonly output: SoundOut;
  private readonly random = seededRandom(SEED + 1);
  private readonly glides = new Map<Bed, Glide>(
    BEDS.map((bed) => [bed, { from: 0, to: 0, elapsedS: 0, glideS: 0, value: 0 }]),
  );
  private readonly nextSpotS = new Map<Bed, number>();
  private clockS = 0;
  private engine: Engine | null = null;
  private heart = false;
  private nextBeatAt = 0;

  constructor(output: SoundOut) {
    this.output = output;
  }

  /** Each named bed glides from where it stands to its new level over `glideS` seconds. */
  set(levels: Partial<AmbienceLevels>, glideS = 2): void {
    for (const bed of BEDS) {
      const level = levels[bed];
      const glide = this.glides.get(bed);
      if (level === undefined || !glide) continue;
      Object.assign(glide, { from: glide.value, to: clampLevel(level), elapsedS: 0, glideS: Math.max(0, glideS) });
      if (glide.glideS === 0) glide.value = glide.to;
    }
  }

  /** Each bed's level as it stands this moment. */
  levels(): AmbienceLevels {
    const levels = { rain: 0, wind: 0, waves: 0, fire: 0, deep: 0, gulls: 0, creak: 0 };
    for (const [bed, glide] of this.glides) levels[bed] = glide.value;
    return levels;
  }

  thunder(distanceKm: number): void {
    this.shot((kit, out, when) => thunderVoice(kit, out, when, distanceKm));
  }

  crash(): void {
    this.shot(crashVoice);
  }

  splash(size: number): void {
    this.shot((kit, out, when) => splashVoice(kit, out, when, clampLevel(size)));
  }

  thud(): void {
    this.shot(thudVoice);
  }

  ringing(seconds: number): void {
    this.shot((kit, out, when) => ringingVoice(kit, out, when, seconds));
  }

  heartbeat(beating: boolean): void {
    this.heart = beating;
  }

  flash(): void {
    this.shot(flashVoice);
  }

  whoosh(): void {
    this.shot(whooshVoice);
  }

  /** Moves every glide on by `seconds`, writes the beds' gains, and plays the spot sounds and heartbeats now due. */
  frame(seconds: number): void {
    this.clockS += Math.max(0, seconds);
    for (const glide of this.glides.values()) {
      glide.elapsedS += Math.max(0, seconds);
      glide.value = glided(glide.from, glide.to, glide.elapsedS, glide.glideS);
    }
    const engine = this.live();
    if (!engine) return;
    const now = engine.kit.audio.currentTime;
    for (const bed of BEDS) {
      const value = this.glides.get(bed)?.value ?? 0;
      const built = engine.beds.get(bed) ?? (value > 0 ? this.buildBed(engine, bed) : null);
      built?.gain.gain.setTargetAtTime(value * BED_GAIN[bed], now, EASE_S);
    }
    for (const { bed, meanGapS, voice } of SPOTS) {
      const level = this.glides.get(bed)?.value ?? 0;
      const due = this.nextSpotS.get(bed) ?? Number.POSITIVE_INFINITY;
      if (level <= 0) this.nextSpotS.delete(bed);
      else if (!Number.isFinite(due)) this.nextSpotS.set(bed, this.clockS + nextGapS(meanGapS, level, this.random()));
      else if (this.clockS >= due) {
        const bedGain = engine.beds.get(bed)?.gain;
        if (bedGain) voice(engine.kit, bedGain, now);
        this.nextSpotS.set(bed, this.clockS + nextGapS(meanGapS, level, this.random()));
      }
    }
    if (!this.heart) this.nextBeatAt = 0;
    else {
      this.nextBeatAt = Math.max(this.nextBeatAt, now);
      // Beats are laid a little ahead of the clock, so an uneven frame never makes the heart stumble.
      while (this.nextBeatAt < now + 0.15) {
        heartbeatVoice(engine.kit, engine.shots, this.nextBeatAt);
        this.nextBeatAt += BEAT_S;
      }
    }
  }

  /** Silences everything at once and lets go of every node; the next sound builds them afresh. */
  stop(): void {
    for (const glide of this.glides.values()) Object.assign(glide, { from: 0, to: 0, value: 0, glideS: 0 });
    this.nextSpotS.clear();
    this.heart = false;
    this.teardown();
  }

  /** The engine on the output as it answers now: built on the first answer, rebuilt should the context change. */
  private live(): Engine | null {
    const output = this.output();
    if (!output) return null;
    if (this.engine && this.engine.kit.audio === output.audio && this.engine.out === output.out) return this.engine;
    this.teardown();
    const { audio, out } = output;
    const master = audio.createGain();
    master.connect(out);
    const shots = audio.createGain();
    shots.gain.value = SHOTS_GAIN;
    shots.connect(master);
    this.engine = { kit: kitFor(audio, this.random), out, master, shots, beds: new Map() };
    return this.engine;
  }

  private teardown(): void {
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    for (const { sources, nodes } of engine.beds.values()) {
      for (const source of sources) source.stop();
      for (const node of nodes) node.disconnect();
    }
    engine.shots.disconnect();
    engine.master.disconnect();
  }

  private shot(voice: (kit: Kit, out: AudioNode, when: number) => void): void {
    const engine = this.live();
    if (engine) voice(engine.kit, engine.shots, engine.kit.audio.currentTime);
  }

  /** A bed's looping graph, built the first time its level rises, so silent beds cost nothing. */
  private buildBed(engine: Engine, bed: Bed): BedGraph {
    const { audio, white, brown } = engine.kit;
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(engine.master);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [gain];
    const loop = (buffer: AudioBuffer, ...chain: AudioNode[]): AudioNode => {
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start(audio.currentTime, this.random() * buffer.duration);
      sources.push(source);
      nodes.push(source, ...chain);
      let last: AudioNode = source;
      for (const node of chain) last = last.connect(node);
      return last;
    };
    const filter = (type: BiquadFilterType, frequency: number, quality = 0.7) => {
      const biquad = audio.createBiquadFilter();
      Object.assign(biquad, { type });
      biquad.frequency.value = frequency;
      biquad.Q.value = quality;
      return biquad;
    };
    /** A slow wobble added to `param`: `depth` either side of where it stands, `rate` times a second. */
    const wobble = (param: AudioParam, rate: number, depth: number) => {
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = rate;
      const amount = audio.createGain();
      amount.gain.value = depth;
      oscillator.connect(amount).connect(param);
      oscillator.start();
      sources.push(oscillator);
      nodes.push(oscillator, amount);
    };
    if (bed === 'rain') {
      // A downpour: hiss over a duller roar of drops on the sea.
      loop(white, filter('highpass', 600), filter('lowpass', 9000)).connect(gain);
      const roar = audio.createGain();
      roar.gain.value = 1;
      loop(brown, filter('bandpass', 900, 0.6), roar).connect(gain);
    } else if (bed === 'wind') {
      // A gale: its pitch and its strength wander at unrelated slow rates, so the gusts never repeat.
      const howl = filter('bandpass', 450, 1.6);
      const gust = audio.createGain();
      gust.gain.value = 0.5;
      loop(brown, howl, gust).connect(gain);
      wobble(howl.frequency, 0.09, 220);
      wobble(gust.gain, 0.19, 0.3);
      wobble(gust.gain, 0.07, 0.17);
    } else if (bed === 'waves') {
      // The sea round the hull, swelling and easing.
      const swell = audio.createGain();
      swell.gain.value = 0.65;
      loop(brown, filter('lowpass', 650), swell).connect(gain);
      wobble(swell.gain, 0.11, 0.3);
    } else if (bed === 'fire') {
      // A blaze: a low roar under a loop of crackle.
      loop(brown, filter('lowpass', 600)).connect(gain);
      const snaps = bufferOf(
        audio,
        seamlessLoop(crackle(audio.sampleRate * 4, audio.sampleRate, this.random, 40), 256),
      );
      const crackleGain = audio.createGain();
      crackleGain.gain.value = 0.4;
      loop(snaps, filter('highpass', 1200), crackleGain).connect(gain);
    } else if (bed === 'deep') {
      // Under the water: a muffled pressure, all low notes.
      loop(brown, filter('lowpass', 120, 1.2)).connect(gain);
    }
    const built = { gain, sources, nodes };
    engine.beds.set(bed, built);
    return built;
  }
}
