// One ambience sounding: its beds' recordings looping under their breathing gains, wide or at their points, and its
// voices' recordings called round the listener at their spots, each on its own wandering clock. A recording not yet
// come is silent. Everything it plays passes through its own gain, which the engine (ambience.ts) fades as the player
// comes and goes.

import { playSample, type SamplePlay } from '../../../soundSamples.ts';
import { type Random, between } from './dsp.ts';
import { bedChain, callChain, roomOf, toAudio } from './graph.ts';
import {
  type AmbienceKey,
  boutTimes,
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
import { BED_LOUD, SOFTER_BEDS } from './recordings.ts';
import { type BedLayer, type Drive, SCAPES, type Scape, type Voice } from './scapes.ts';
import { FIGHT_NEAR_M } from './seaFight.ts';
import { type HeardWeather, SHELTERING, THUNDER_MOST, type Thunder, gustDepth, snowSoftening } from './weatherLaw.ts';

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
/** A bed's crossfade from one play of its recording into the next, seconds. */
const BED_FADE_S = 4;
/** A bed is as loud as its recording's whole length; a thunder, as its loudest 0.4 s. */
const BED_MEASURED_S = Infinity;
const THUNDER_MEASURED_S = 0.4;
/** Each thunder's recording, and its loudest 0.4 s at a strike's whole level, as the thunder it took the place of. */
const THUNDERS = {
  'thunder.crack': { cue: 'amb.thunder.crack', loud: 0.3328 },
  'thunder.roll': { cue: 'amb.thunder.roll', loud: 0.3111 },
} as const;
/** Every bed's share of the mix under the calls: a bed of gain 1 sits at -32 dBFS. */
export const BED_LEVEL = 0.25;
/** A recording not yet come is asked for again after this long, seconds. */
const RECORDING_AGAIN_S = 5;
/** How near a standing bed is heard whole, metres: a shore, a city's crowd and a harbour are wide sources. */
const NEAR_M: Readonly<Record<BedLayer['at'], number>> = { wide: 1, shore: 40, harbour: 60, city: 90, river: 20 };

interface BedPlaying {
  readonly layer: BedLayer;
  readonly seed: number;
  /** Its level and where it stands, and the play of its recording sounding and when it ends. */
  chain: {
    readonly level: GainNode;
    readonly panner: PannerNode | null;
    play: { readonly gain: GainNode; readonly source: AudioBufferSourceNode; readonly endsAt: number } | null;
  } | null;
}

/** An equal-power fade in and out over a crossfade: a play and the one it fades from sum to the same loudness. */
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
}

/** The page's own context, where recordings play; none in a render's. */
const liveContext = (audio: BaseAudioContext): AudioContext | null =>
  typeof AudioContext !== 'undefined' && audio instanceof AudioContext ? audio : null;

export class ScapePlayer {
  readonly key: AmbienceKey;
  readonly scape: Scape;
  readonly gain: GainNode;
  /** The fade's level, 0 to 1, and where it is going. */
  level = 0;
  target = 1;
  private readonly audio: BaseAudioContext;
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

  constructor(audio: BaseAudioContext, out: AudioNode, key: AmbienceKey, random: Random, calls: { count: number }) {
    [this.audio, this.key, this.scape, this.random, this.calls] = [audio, key, SCAPES[key], random, calls];
    this.gain = audio.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);
    this.send = roomOf(audio, this.scape.room, random, this.gain);
    this.beds = this.scape.beds.map((layer, nth) => ({ layer, seed: nth * 7.31 + 1.7, chain: null }));
    this.clocks = this.scape.voices.map((voice, nth) => ({ voice, seed: nth * 3.77 + 0.9, next: NaN, density: 0 }));
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

  /** How many beds play their recordings. */
  get sources(): number {
    return this.beds.filter((playing) => playing.chain?.play).length;
  }

  /** Stops everything it plays. */
  stop(): void {
    for (const playing of this.beds) playing.chain?.play?.source.stop();
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
    const shape = { gain, pitch, near: THUNDER_PLACED_M, corner: thunder.corner };
    const { cue, loud } = THUNDERS[thunder.sound];
    // Its peaks may reach the thunder's ceiling and no further.
    const like = {
      measured: { peak: 1, loud },
      windowS: THUNDER_MEASURED_S,
      most: THUNDER_MOST / Math.max(1e-3, thunder.gain),
    };
    this.recorded(cue, point, heard, shape, after, like, this.thunders);
  }

  /** A step of the player's own on wooden planks. */
  footstep(heard: Heard): void {
    const [x, y, z] = heard.ear;
    const point: Point3 = [x, y, z - 1.5];
    const shape = {
      gain: between(this.random, [0.3, 0.42]),
      pitch: between(this.random, [0.92, 1.08]),
      near: 2,
    };
    this.recorded('step.wood', point, heard, shape);
  }

  /** One of the sea fight's sounds where it happens (seaFight.ts), `gain` times as loud. */
  fight(cue: string, point: Point3, heard: Heard, gain = 1): void {
    this.recorded(cue, point, heard, { gain, pitch: between(this.random, [0.95, 1.05]), near: FIGHT_NEAR_M });
  }

  /** A bed's recording given its gain by its law, and placed where it stands: silent where there is no such place near. */
  private bed(playing: BedPlaying, clock: number, heard: Heard): void {
    const { layer } = playing;
    const points = this.pointsOf(layer, heard);
    const now = this.audio.currentTime;
    let law = layer.gain * byPhase(layer.when, heard.phases) * breathOf(clock, playing.seed, layer.breath);
    law *= this.drive(layer.drive, heard) * BED_LEVEL;
    const weatherBed = [layer.drive].flat().some((drive) => drive === 'rain' || drive === 'sand');
    if (!weatherBed) law *= snowSoftening(heard.weather);
    if (SHELTERING.has(layer.bed)) law *= heard.shelter;
    if (layer.swell) law *= 0.45 + 0.55 * swellAt(clock - (layer.drive === 'way' ? 1.7 : 0));
    if (layer.gust) {
      const depth = gustDepth(layer.gust, heard.weather);
      law *= heard.drives.wind * (1 - depth + depth * gustOf(clock, playing.seed));
    }
    if (points?.length === 0) law = 0;
    this.recordedBed(playing, now, law, toAudioOf(points?.[0], heard));
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

  /** A bed's recording at `law`, heard from where it stands (its first point, for a standing bed); each play fades
   *  into the next, at equal power, so it never dips. */
  private recordedBed(
    playing: BedPlaying,
    now: number,
    law: number,
    standing: readonly [number, number, number] | null,
  ): void {
    const audio = liveContext(this.audio);
    if (!audio) return;
    const bed = playing.chain;
    if (bed) {
      bed.level.gain.setTargetAtTime(law, now, BED_FOLLOW_S);
      if (bed.panner && standing) placePanner(bed.panner, standing, now, false);
    }
    if (!bed?.play || now >= bed.play.endsAt - BED_FADE_S) this.nextBedPlay(playing, audio, now, law);
    const placed = playing.chain;
    if (!bed && placed?.panner && standing) placePanner(placed.panner, standing, now, true);
  }

  /** The bed's recording played again, fading in over the play before it, which fades out. */
  private nextBedPlay(playing: BedPlaying, audio: AudioContext, now: number, law: number): void {
    const { layer } = playing;
    const gain = audio.createGain();
    // A bed lies far under the mix's ceiling (BED_LEVEL), so its recording takes the bed's loudness, spiky or not.
    const loud = SOFTER_BEDS[layer.bed] ?? BED_LOUD;
    const like = { measured: { peak: 1, loud }, windowS: BED_MEASURED_S, most: Infinity };
    const source = playSample(audio, gain, layer.recorded, between(this.random, [0.98, 1.02]), { like });
    if (!source?.buffer) {
      gain.disconnect();
      return;
    }
    const standing = layer.at !== 'wide';
    const bed = playing.chain ?? {
      ...bedChain(audio, { standing, near: layer.near ?? NEAR_M[layer.at] }, this.gain, this.send),
      play: null,
    };
    if (!playing.chain) bed.level.gain.setValueAtTime(law, now);
    gain.gain.setValueCurveAtTime(FADE_IN, now, BED_FADE_S);
    gain.connect(bed.level);
    if (bed.play) {
      bed.play.gain.gain.cancelScheduledValues(now);
      bed.play.gain.gain.setValueCurveAtTime(FADE_OUT, now, BED_FADE_S);
    }
    source.addEventListener('ended', () => gain.disconnect());
    bed.play = { gain, source, endsAt: now + source.buffer.duration / source.playbackRate.value };
    playing.chain = bed;
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
    // A recording is a bout's whole: it sounds once, and the bout's length passes before the next.
    const times = boutTimes(voice.bout, voice.spacing, this.random);
    each.next += times[times.length - 1] ?? 0;
    const shape = {
      gain: between(this.random, voice.gain as [number, number]),
      pitch: between(this.random, voice.pitch as [number, number]),
      near: voice.near,
    };
    this.recorded(voice.recorded, point, heard, shape);
  }

  /** A recording through its own chain, `after` seconds from now, once it has come; as loud as `like` where given,
   *  else by its own levelling. Answers whether it sounds. */
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
    const chain = callChain(
      audio,
      { point, ear: heard.ear, origin: heard.origin, ...shape, when },
      this.gain,
      this.send,
    );
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
      };
      this.recorded('step.stone', point, heard, shape);
    }
  }
}
