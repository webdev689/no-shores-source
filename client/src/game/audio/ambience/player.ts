// One ambience sounding: its beds looping under their breathing gains, wide or at their points, and its voices called
// round the listener at their spots, each on its own wandering clock. Everything it plays passes through its own
// gain, which the engine (ambience.ts) fades as the player comes and goes.

import { playSample, type SamplePlay } from '../../../soundSamples.ts';
import type { Bank } from './bank.ts';
import { type Random, between } from './dsp.ts';
import { type Emitter, callChain, emitterOf, recordedBedChain, release, roomOf, toAudio } from './graph.ts';
import {
  type AmbienceKey,
  BREAKER_S,
  boutTimes,
  breakerAt,
  breathOf,
  byPhase,
  gapAfter,
  gustOf,
  moodOf,
  type Phase,
  swellAt,
  walkedOn,
} from './law.ts';
import { type Lay, type Point3, cityPoint, placeCall, riverNear, shorePoints } from './places.ts';
import { type BedLayer, type Drive, SCAPES, type Scape, type Voice } from './scapes.ts';
import { FIGHT_NEAR_M } from './seaFight.ts';
import { type Job, type SoundKey, takesOf } from './sounds.ts';
import {
  type HeardWeather,
  SHELTERING,
  THUNDER_MOST,
  type Thunder,
  gustDepth,
  rainCorner,
  snowSoftening,
} from './weatherLaw.ts';

/** What the ambience hears this frame: where the ear is and faces, the frame's origin (the ship at sea, so all rides
 *  with it), the land, the phases of the hour, the drives, the weather and the share of the day's birds and insects
 *  not gone to shelter from it, and a social space's walking people. */
export interface Heard {
  readonly key: AmbienceKey;
  readonly ear: Point3;
  readonly yaw: number;
  readonly origin: readonly [number, number];
  readonly lay: Lay;
  readonly phases: Readonly<Record<Phase, number>>;
  readonly drives: Readonly<Record<Drive, number>>;
  readonly weather: HeardWeather;
  readonly shelter: number;
  readonly folk: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly anim: string;
  }[];
}

/** Thunder is placed this far along the way it comes from, metres, heard whole there: its level and its darkness are
 *  its distance's own (weatherLaw.ts), never the panner's. */
const THUNDER_PLACED_M = 800;
const THUNDER_LIFT_M = 150;

/** The most calls sounding at once in the whole ambience: past it, a new one waits for its next turn. */
export const MOST_CALLS = 20;
/** Thunder sounds apart from the calls, at most this many rolls at once (a near crack always comes through), so a
 *  storm's many strikes never crowd out the birds, the hull and the steps. */
export const MOST_THUNDERS = 6;
/** How often the beds' gains and points are set, seconds. */
const BEDS_EVERY_S = 0.1;
/** How fast a bed's gain follows its law, seconds. */
const BED_FOLLOW_S = 0.3;
/** A step heard every this many metres a person walks, within this far. */
const STRIDE_M = 0.75;
const STEPS_HEARD_M = 24;
/** A wave crashing this near is heard as its own crash over the surf. */
const CRASH_HEARD_M = 140;
/** The recorded bed's crossfade from one play of it into the next, seconds. */
const RECORDED_FADE_S = 4;
/** A recorded bed takes the loudness of the whole of the synthesiser's bed; a recorded thunder, of its loudest moment. */
const BED_MATCHED_S = Infinity;
const THUNDER_MATCHED_S = 0.4;
/** The owner's Freesound pick for each of the synthesiser's thunders. */
const THUNDER_RECORDED = { 'thunder.crack': 'amb.thunder.crack', 'thunder.roll': 'amb.thunder.roll' } as const;
/** Every bed's share of the mix under the calls: a bed of gain 1 sits at -32 dBFS. */
export const BED_LEVEL = 0.25;
/** A recording not yet come is asked for again after this long, seconds. */
const RECORDING_AGAIN_S = 5;
/** How near a standing bed is heard whole, metres: a shore, a city's crowd and a harbour are wide sources. */
const NEAR_M: Readonly<Record<BedLayer['at'], number>> = { wide: 1, shore: 40, harbour: 60, city: 90, river: 20 };
/** A gust opens a gusty bed's top from this corner, Hz, by up to this many octaves. */
/** A gust's pitch on a gusty bed: from the first, up by the second. */
const GUST_PITCH = [0.95, 0.12] as const;
const GUST_CORNER = 2400;
const GUST_OCTAVES = 2.2;

interface BedPlaying {
  readonly layer: BedLayer;
  readonly seed: number;
  emitters: Emitter[];
  /** Its recording's level and where it stands, the play sounding and when it ends, and when the first play began. */
  recorded: {
    readonly level: GainNode;
    readonly panner: PannerNode | null;
    play: { readonly gain: GainNode; readonly source: AudioBufferSourceNode; readonly endsAt: number } | null;
    readonly since: number;
  } | null;
}

/** An equal-power fade in and out over a crossfade: a recording and what it fades from sum to the same loudness. */
const FADE_IN = Float32Array.from({ length: 64 }, (unused, step) => Math.sin((Math.PI / 2) * (step / 63)));
const FADE_OUT = FADE_IN.slice().reverse();

/** A point in the audio's frame, or null for none. */
const toAudioOf = (point: Point3 | undefined, heard: Heard): readonly [number, number, number] | null =>
  point ? toAudio(point, heard.origin) : null;

/** Moves a panner to a point (audio's frame): at once the first time, smoothly after. */
function placePanner(panner: PannerNode, [x, y, z]: readonly [number, number, number], now: number, first: boolean) {
  for (const [param, value] of [
    [panner.positionX, x],
    [panner.positionY, y],
    [panner.positionZ, z],
  ] as const)
    if (first) param.setValueAtTime(value, now);
    else param.setTargetAtTime(value, now, 0.5);
}

interface VoiceClock {
  readonly voice: Voice;
  readonly seed: number;
  next: number;
  density: number;
  lastTake: Map<SoundKey, number>;
}

/** The page's own context, where recordings play; none in a render's. */
const liveContext = (audio: BaseAudioContext): AudioContext | null =>
  typeof AudioContext !== 'undefined' && audio instanceof AudioContext ? audio : null;

/** Every job a scape needs: its beds first, then every take of every sound its voices sing. */
export function jobsOf(scape: Scape): Job[] {
  const beds = [...new Set(scape.beds.map((layer) => layer.bed))].map((key): Job => ({ kind: 'bed', key }));
  const always: SoundKey[] = ['surf.crash', 'step', 'thunder.crack', 'thunder.roll'];
  const sounds = [...new Set([...scape.voices.flatMap((voice) => voice.sounds), ...always])];
  return [
    ...beds,
    ...sounds.flatMap((key) =>
      Array.from({ length: takesOf(key) }, (unused, take): Job => ({ kind: 'sound', key, take })),
    ),
  ];
}

export class ScapePlayer {
  readonly key: AmbienceKey;
  readonly scape: Scape;
  readonly gain: GainNode;
  /** The fade's level, 0 to 1, and where it is going. */
  level = 0;
  target = 1;
  private readonly audio: BaseAudioContext;
  private readonly bank: Bank;
  private readonly random: Random;
  private readonly beds: BedPlaying[];
  private readonly clocks: VoiceClock[];
  private readonly walked = new Map<number, { x: number; y: number; since: number }>();
  private bedsAt = -Infinity;
  private calls: { count: number };
  private readonly thunders = { count: 0 };
  /** The room each call is sent a share of. */
  private readonly send: GainNode;
  /** When each recording not yet come may be asked for again. */
  private readonly missing = new Map<string, number>();

  constructor(
    audio: BaseAudioContext,
    out: AudioNode,
    key: AmbienceKey,
    bank: Bank,
    random: Random,
    calls: { count: number },
  ) {
    [this.audio, this.key, this.scape, this.bank, this.random, this.calls] = [
      audio,
      key,
      SCAPES[key],
      bank,
      random,
      calls,
    ];
    this.gain = audio.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    this.send = roomOf(audio, this.scape.room, random, this.gain);
    this.beds = this.scape.beds.map((layer, nth) => ({ layer, seed: nth * 7.31 + 1.7, emitters: [], recorded: null }));
    this.clocks = this.scape.voices.map((voice, nth) => ({
      voice,
      seed: nth * 3.77 + 0.9,
      next: NaN,
      density: 0,
      lastTake: new Map(),
    }));
    for (const job of jobsOf(this.scape)) bank.want(job);
  }

  /** One frame: the beds' gains and points, and, while it is the place heard (`live`), its voices' calls and its
   *  people's steps. `clock` is the ambience's own seconds. */
  frame(clock: number, heard: Heard, live: boolean): void {
    if (clock - this.bedsAt >= BEDS_EVERY_S) {
      this.bedsAt = clock;
      for (const playing of this.beds) this.bed(playing, clock, heard);
    }
    if (!live) return;
    for (const each of this.clocks) this.voiceTurn(each, clock, heard);
    if (heard.folk.length) this.steps(heard);
  }

  /** How many bed sources it plays. */
  get sources(): number {
    return this.beds.reduce(
      (sum, playing) => sum + playing.emitters.reduce((inner, emitter) => inner + emitter.sources.length, 0),
      0,
    );
  }

  /** Stops everything it plays. */
  stop(): void {
    for (const playing of this.beds) for (const emitter of playing.emitters) release(this.audio, emitter);
    for (const playing of this.beds) playing.recorded?.play?.source.stop();
    this.gain.disconnect();
  }

  private drive(drive: Drive | readonly Drive[] | undefined, heard: Heard): number {
    if (!drive) return 1;
    return typeof drive === 'string'
      ? heard.drives[drive]
      : drive.reduce((product, each) => product * heard.drives[each], 1);
  }

  /** A strike's thunder, `after` seconds from now, from the way it comes. */
  thunder(thunder: Thunder, heard: Heard, after: number): void {
    if (this.thunders.count >= MOST_THUNDERS && thunder.sound !== 'thunder.crack') return;
    const [east, south] = thunder.toward;
    const [x, y, z] = heard.ear;
    const point: Point3 = [x + east * THUNDER_PLACED_M, y + south * THUNDER_PLACED_M, z + THUNDER_LIFT_M];
    const pitch = thunder.pitch * between(this.random, [0.94, 1.04]);
    // The same in every place: a place's own level is taken back off it.
    const gain = thunder.gain / this.scape.level;
    const shape = { gain, pitch, near: THUNDER_PLACED_M, drift: 0, corner: thunder.corner };
    const synth = this.bank.buffer({ kind: 'sound', key: thunder.sound, take: 0 });
    // A recording's peaks may reach the thunder's ceiling, as the synthesiser's nearest crack does, and no further.
    const like = synth
      ? { sound: synth, windowS: THUNDER_MATCHED_S, most: THUNDER_MOST / Math.max(1e-3, thunder.gain) }
      : undefined;
    const recorded =
      like && this.recorded(THUNDER_RECORDED[thunder.sound], point, heard, shape, after, like, this.thunders);
    if (!recorded) this.call(thunder.sound, point, heard, shape, after, undefined, this.thunders);
  }

  /** A step of the player's own on wooden planks: the recording once loaded, the synthesiser's until then. */
  footstep(heard: Heard): void {
    const [x, y, z] = heard.ear;
    const point: Point3 = [x, y, z - 1.5];
    const shape = {
      gain: between(this.random, [0.3, 0.42]),
      pitch: between(this.random, [0.92, 1.08]),
      near: 2,
      drift: 0,
    };
    if (!this.recorded('step.wood', point, heard, shape)) this.call('step', point, heard, shape);
  }

  /** One of the sea fight's sounds where it happens (seaFight.ts), `gain` times as loud: its recording once picked,
   *  else nothing. */
  fight(cue: string, point: Point3, heard: Heard, gain = 1): void {
    this.recorded(cue, point, heard, { gain, pitch: between(this.random, [0.95, 1.05]), near: FIGHT_NEAR_M });
  }

  /** A bed's emitters made once its buffer has come, placed, and given their gains. */
  private bed(playing: BedPlaying, clock: number, heard: Heard): void {
    const { layer } = playing;
    const job: Job = { kind: 'bed', key: layer.bed };
    const buffer = this.bank.buffer(job);
    if (!buffer) return;
    const points = this.pointsOf(layer, heard);
    const make = (standing: boolean) =>
      emitterOf(
        this.audio,
        buffer,
        { standing, gusty: (!!layer.gust && !layer.bright) || !!layer.brightens, near: layer.near ?? NEAR_M[layer.at] },
        this.random,
        this.gain,
        this.send,
      );
    if (points && playing.emitters.length !== points.length) {
      for (const emitter of playing.emitters) release(this.audio, emitter, 1);
      playing.emitters = points.map(() => make(true));
    } else if (!points && playing.emitters.length === 0) playing.emitters = [make(false)];
    const now = this.audio.currentTime;
    let law = layer.gain * byPhase(layer.when, heard.phases) * breathOf(clock, playing.seed, layer.breath);
    law *= this.drive(layer.drive, heard) * BED_LEVEL;
    const weatherBed = [layer.drive].flat().some((drive) => drive === 'rain' || drive === 'sand');
    if (!weatherBed) law *= snowSoftening(heard.weather);
    if (SHELTERING.has(layer.bed)) law *= heard.shelter;
    if (layer.swell) law *= 0.45 + 0.55 * swellAt(clock - (layer.drive === 'way' ? 1.7 : 0));
    const gust = layer.gust ? gustOf(clock, playing.seed) : 0;
    const depth = layer.gust ? gustDepth(layer.gust, heard.weather) : 0;
    if (layer.gust) law *= heard.drives.wind * (1 - depth + depth * gust);
    const corner = layer.brightens
      ? rainCorner(heard.weather.rain)
      : GUST_CORNER * 2 ** (GUST_OCTAVES * gust) * snowSoftening(heard.weather);
    if (layer.recorded) law *= this.recordedBed(playing, now, law, buffer, toAudioOf(points?.[0], heard));
    playing.emitters.forEach((emitter, nth) => {
      const point = points?.[nth] ?? null;
      let gain = law;
      if (point && emitter.panner) {
        placePanner(emitter.panner, toAudio(point, heard.origin), now, !emitter.point);
        emitter.point = point;
      }
      if (layer.breakers) gain *= this.breaker(emitter, clock, heard);
      emitter.gain.gain.setTargetAtTime(gain, now, BED_FOLLOW_S);
      emitter.tone?.frequency.setTargetAtTime(corner, now, BED_FOLLOW_S);
      // A gust raises the wind's voice a little, as a stronger wind whistles higher in the same edges.
      if (layer.gust)
        for (const source of emitter.sources)
          source.playbackRate.setTargetAtTime(GUST_PITCH[0] + GUST_PITCH[1] * gust, now, BED_FOLLOW_S);
    });
  }

  /** Where a bed stands: null for one wide about the ear, else its points (none where there is no such place near). */
  private pointsOf(layer: BedLayer, heard: Heard): Point3[] | null {
    const flat = [heard.ear[0], heard.ear[1]] as const;
    switch (layer.at) {
      case 'wide':
        return null;
      case 'shore':
        return shorePoints(flat, heard.lay.outline).map(([x, y]) => [x, y, 0.5]);
      case 'harbour':
        return heard.lay.harbour ? [[heard.lay.harbour[0], heard.lay.harbour[1], 1]] : [];
      case 'river': {
        const river = riverNear(flat, heard.lay.rivers);
        return river ? [[river[0], river[1], Math.max(0, heard.lay.heightAt(river[0], river[1])) + 0.5]] : [];
      }
      case 'city': {
        const city = cityPoint(heard.lay);
        return city ? [[city[0], city[1], Math.max(0, heard.lay.heightAt(city[0], city[1])) + 3]] : [];
      }
    }
  }

  /** A shore's breaker: its swell now, and its crash heard as a wave of its own when near. */
  private breaker(emitter: Emitter, clock: number, heard: Heard): number {
    const step = clock - (emitter.wave + emitter.period);
    if (step >= 0) {
      emitter.wave = clock;
      emitter.period = between(this.random, BREAKER_S);
      const point = emitter.point;
      if (point && Math.hypot(point[0] - heard.ear[0], point[1] - heard.ear[1]) < CRASH_HEARD_M)
        this.call('surf.crash', point, heard, {
          gain: 0.9,
          pitch: between(this.random, [0.94, 1.06]),
          near: 12,
          drift: 0,
        });
    }
    return breakerAt(clock - emitter.wave, emitter.period);
  }

  /** A bed played from its Freesound recording once picked, as loud as the synthesiser's bed `synth` and heard from
   *  where it stands (its first point, for a standing bed); each play fades into the next, and the first takes over
   *  from the synthesiser, at equal power, so it never dips. Answers the share of the synthesiser's bed still heard. */
  private recordedBed(
    playing: BedPlaying,
    now: number,
    law: number,
    synth: AudioBuffer,
    standing: readonly [number, number, number] | null,
  ): number {
    const cue = playing.layer.recorded;
    const audio = liveContext(this.audio);
    if (!cue || !audio) return 1;
    const bed = playing.recorded;
    if (bed) {
      bed.level.gain.setTargetAtTime(law, now, BED_FOLLOW_S);
      if (bed.panner && standing) placePanner(bed.panner, standing, now, false);
    }
    if (!bed?.play || now >= bed.play.endsAt - RECORDED_FADE_S) this.nextRecordedPlay(playing, audio, now, law, synth);
    const placed = playing.recorded;
    if (!bed && placed?.panner && standing) placePanner(placed.panner, standing, now, true);
    const since = playing.recorded?.since;
    return since === undefined ? 1 : Math.cos((Math.PI / 2) * Math.min(1, (now - since) / RECORDED_FADE_S));
  }

  /** The bed's recording played again, fading in over the play before it, which fades out. */
  private nextRecordedPlay(
    playing: BedPlaying,
    audio: AudioContext,
    now: number,
    law: number,
    synth: AudioBuffer,
  ): void {
    const cue = playing.layer.recorded;
    if (!cue) return;
    const gain = audio.createGain();
    // A bed lies far under the mix's ceiling (BED_LEVEL), so its recording takes the bed's loudness, spiky or not.
    const like = { sound: synth, windowS: BED_MATCHED_S, most: Infinity };
    const source = playSample(audio, gain, cue, between(this.random, [0.98, 1.02]), { like });
    if (!source?.buffer) {
      gain.disconnect();
      return;
    }
    const standing = playing.layer.at !== 'wide';
    const bed = playing.recorded ?? {
      ...recordedBedChain(
        audio,
        { standing, near: playing.layer.near ?? NEAR_M[playing.layer.at] },
        this.gain,
        this.send,
      ),
      play: null,
      since: now,
    };
    if (!playing.recorded) bed.level.gain.setValueAtTime(law, now);
    gain.gain.setValueCurveAtTime(FADE_IN, now, RECORDED_FADE_S);
    gain.connect(bed.level);
    if (bed.play) {
      bed.play.gain.gain.cancelScheduledValues(now);
      bed.play.gain.gain.setValueCurveAtTime(FADE_OUT, now, RECORDED_FADE_S);
    }
    source.addEventListener('ended', () => gain.disconnect());
    bed.play = { gain, source, endsAt: now + source.buffer.duration / source.playbackRate.value };
    playing.recorded = bed;
  }

  /** A voice's turn: once its time comes, a bout of its calls where it lives, then a gap by its density now. */
  private voiceTurn(each: VoiceClock, clock: number, heard: Heard): void {
    const { voice } = each;
    const sheltering = voice.shelters ?? voice.sounds.some((sound) => SHELTERING.has(sound));
    const density =
      byPhase(voice.perMinute, heard.phases) *
      this.drive(voice.drive, heard) *
      moodOf(clock, each.seed) *
      (sheltering ? heard.shelter : 1);
    if (Number.isNaN(each.next) || density > each.density * 2.5) {
      each.next = clock + this.random() * Math.min(60, gapAfter(Math.max(density, 1e-6), this.random));
      each.density = density;
      return;
    }
    if (clock < each.next) return;
    each.density = density;
    each.next = clock + gapAfter(density, this.random);
    if (density <= 0 || this.calls.count >= MOST_CALLS) return;
    const point = placeCall(voice.at, heard.ear, heard.lay, voice, this.random);
    if (!point) return;
    const pitch = between(this.random, voice.pitch as [number, number]);
    const times = boutTimes(voice.bout, voice.spacing, this.random);
    each.next += times[times.length - 1] ?? 0;
    times.forEach((after, nth) => {
      const sound = voice.sounds[nth % Math.max(1, voice.sounds.length)];
      const gain = between(this.random, voice.gain as [number, number]);
      const shape = { gain, pitch, near: voice.near, drift: voice.drift };
      if (voice.recorded && nth === 0 && this.recorded(voice.recorded, point, heard, shape)) return;
      if (voice.recorded && nth > 0 && !sound) return;
      if (sound) this.call(sound, point, heard, shape, after, each.lastTake);
    });
  }

  /** A recorded call through its own chain, `after` seconds from now, once its recording has come; as loud as `like`
   *  where it stands in for that sound, else by its own levelling. */
  private recorded(
    cue: string,
    point: Point3,
    heard: Heard,
    shape: { gain: number; pitch: number; near: number; corner?: number },
    after = 0,
    like?: SamplePlay['like'],
    tally = this.calls,
  ): boolean {
    const audio = liveContext(this.audio);
    if (!audio || (this.missing.get(cue) ?? -Infinity) > audio.currentTime) return false;
    const when = audio.currentTime + after;
    const chain = this.chain(point, heard, { ...shape, drift: 0 }, when, 0);
    const source = playSample(audio, chain.input, cue, shape.pitch, { when, like });
    if (!source) {
      chain.done();
      this.missing.set(cue, audio.currentTime + RECORDING_AGAIN_S);
      return false;
    }
    tally.count++;
    source.addEventListener('ended', () => {
      tally.count--;
      chain.done();
    });
    return true;
  }

  /** A call of a sound at a point, `after` seconds from now, its take any but the one played last. */
  private call(
    sound: SoundKey,
    point: Point3,
    heard: Heard,
    shape: { gain: number; pitch: number; near: number; drift: number; corner?: number },
    after = 0,
    lastTake = new Map<SoundKey, number>(),
    tally = this.calls,
  ): void {
    const takes = takesOf(sound);
    const last = lastTake.get(sound);
    const take =
      last === undefined
        ? Math.floor(this.random() * takes)
        : (last + 1 + Math.floor(this.random() * (takes - 1))) % takes;
    lastTake.set(sound, take);
    const buffer = this.bank.buffer({ kind: 'sound', key: sound, take });
    if (!buffer) return;
    const when = this.audio.currentTime + 0.03 + after;
    const chain = this.chain(point, heard, shape, when, buffer.duration / shape.pitch);
    const source = this.audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = shape.pitch;
    source.connect(chain.input);
    source.start(when);
    tally.count++;
    source.addEventListener('ended', () => {
      tally.count--;
      source.disconnect();
      chain.done();
    });
  }

  private chain(
    point: Point3,
    heard: Heard,
    shape: { gain: number; near: number; drift: number; corner?: number },
    when: number,
    seconds: number,
  ) {
    const { ear, origin } = heard;
    return callChain(this.audio, { point, ear, origin, ...shape, when, seconds }, this.random, this.gain, this.send);
  }

  /** The social space's people's steps, each where they walk, within earshot. */
  private steps(heard: Heard): void {
    for (const person of heard.folk) {
      const kept = this.walked.get(person.id);
      if (!kept || person.anim !== 'walk') {
        this.walked.set(person.id, { x: person.x, y: person.y, since: 0 });
        continue;
      }
      kept.since = walkedOn(kept.since, Math.hypot(person.x - kept.x, person.y - kept.y));
      [kept.x, kept.y] = [person.x, person.y];
      if (kept.since < STRIDE_M) continue;
      kept.since -= STRIDE_M;
      const away = Math.hypot(person.x - heard.ear[0], person.y - heard.ear[1]);
      if (away > STEPS_HEARD_M || this.calls.count >= MOST_CALLS) continue;
      const point: Point3 = [person.x, person.y, person.z + 0.05];
      const shape = {
        gain: between(this.random, [0.18, 0.28]),
        pitch: between(this.random, [0.92, 1.08]),
        near: 3,
        drift: 0,
      };
      if (!this.recorded('step.stone', point, heard, shape)) this.call('step', point, heard, shape);
    }
  }
}
