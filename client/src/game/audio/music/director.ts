// The music director: plays what the law asks (directorLaw.ts), on bar lines. A mood's layers come in or go out on
// the playing song's next bar line; a new song begins on it while the old fades over a bar; a fight that ends fades
// over two bars, never cut. A sting (a boss waking or falling, a fight won or lost) begins on the bar line and holds
// the next song until it has played. The ambience is lowered under the music as a fight grows and let back after.
// The families' fight scores and Saltmere's theme are the composer's to write: until each comes, its place is silent.

import { duckAmbience, musicOutput } from '../../uiSounds.ts';
import { boardingScore } from './boardingScore.ts';
import {
  type Boss,
  type Cue,
  type Family,
  type Hearing,
  MOOD_DUCK,
  MOOD_LEVEL,
  MOOD_ROLES,
  type Memory,
  QUIET,
  type Sting,
  hear,
} from './directorLaw.ts';
import { type FootHeard, type SeaHeard, hearNode, hearSea } from './hearing.ts';
import { reckoningScore } from './reckoningScore.ts';
import { ROLES, type Role, type Song, TICKS_PER_BEAT, songSeconds } from './score.ts';
import { type SeaSong, seaSongs } from './seaScore.ts';
import { START_LEAD_S, SongPlayer, songTail } from './songPlayer.ts';
import { wrathScore } from './wrathScore.ts';

/** A family's fight score: one song in layers for every mood, and its moments: the cadence a fight ends on, a fight
 *  won, a fight lost. */
export interface FightScore {
  readonly song: Song;
  readonly cadence?: Song;
  readonly victory?: Song;
  readonly defeat?: Song;
}

/** A boss's score: a song a phase, and its moments: the wake into the first, the last stand, its fall, the player's. */
export interface BossScore {
  readonly phases: readonly Song[];
  readonly wake?: Song;
  readonly last?: Song;
  readonly fallen?: Song;
  readonly defeat?: Song;
}

export interface Scores {
  readonly families: Readonly<Record<Family, FightScore | null>>;
  readonly social: Song | null;
  readonly sea: Readonly<Record<SeaSong, Song>>;
  readonly bosses: Readonly<Record<Boss, BossScore>>;
}

/** Every score the game plays. */
export function overlookScores(): Scores {
  const boarding = boardingScore();
  return {
    families: { green: null, dry: null, wet: null, cold: null },
    social: null,
    sea: seaSongs(),
    bosses: { boarding: { ...boarding, defeat: boarding.end }, reckoning: reckoningScore(), wrath: wrathScore() },
  };
}

/** The song a cue plays, or null for silence; a boss score with no last stand plays its last phase. */
export function songOf(scores: Scores, cue: Cue): Song | null {
  switch (cue.kind) {
    case 'none':
      return null;
    case 'social':
      return scores.social;
    case 'family':
      return scores.families[cue.family]?.song ?? null;
    case 'sea':
      return scores.sea[cue.song];
    case 'boss': {
      const { phases, last } = scores.bosses[cue.boss];
      const final = phases[phases.length - 1] ?? null;
      return cue.part === 'last' ? (last ?? final) : (phases[cue.part - 1] ?? final);
    }
  }
}

/** A sting's song, or null for the silence that stands in until one is written. */
export function stingOf(scores: Scores, sting: Sting): Song | null {
  if (sting.kind === 'wake') return scores.bosses[sting.boss].wake ?? null;
  if (sting.kind === 'fallen') return scores.bosses[sting.boss].fallen ?? null;
  const { cue } = sting;
  if (cue.kind === 'boss') return sting.kind === 'defeat' ? (scores.bosses[cue.boss].defeat ?? null) : null;
  if (cue.kind === 'family') return scores.families[cue.family]?.[sting.kind] ?? null;
  return null;
}

/** A fight's end fades over two bars; a song giving way to another fades over a beat of its own from the bar line
 *  the next begins on, so two tempos never sound over each other for long. */
const RESOLVE_BARS = 2;
/** The music's own ceiling, dBFS at the full volume: songs giving way to each other, and stings over them, sum
 *  under it. */
const CEILING_DB = -1;
/** Seconds the ambience takes to be lowered, and to come back. */
const DUCK_S = 2;
const UNDUCK_S = 4;
/** The social space's theme plays whole, the ambience a little under it. */
const ALL_ROLES: ReadonlySet<Role> = new Set(ROLES);
const SOCIAL_DUCK = 0.8;

const barOf = (song: Song): number => song.ticksPerBar * song.secondsPerTick;
const beatOf = (song: Song): number => TICKS_PER_BEAT * song.secondsPerTick;

/** A soft ceiling into `out`: c tanh(x / c), as good as untouched under -6 dBFS, never past c; it reads inputs to
 *  +6 dBFS (halved into the shaper's -1 to 1), oversampled so its rounding folds nothing back into the band. */
function ceilingOn(audio: BaseAudioContext, out: AudioNode): AudioNode {
  const top = 10 ** (CEILING_DB / 20);
  const half = audio.createGain();
  half.gain.value = 0.5;
  const shaper = audio.createWaveShaper();
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) curve[i] = top * Math.tanh((2 * ((2 * i) / (curve.length - 1) - 1)) / top);
  shaper.curve = curve;
  shaper.oversample = '4x';
  half.connect(shaper).connect(out);
  return half;
}

/** Where the music plays: an audio context's clock and the node it goes into. */
export interface MusicOut {
  readonly audio: BaseAudioContext;
  readonly out: AudioNode;
}

export interface DirectorOptions {
  readonly output?: () => MusicOut | null;
  readonly duck?: (level: number, seconds: number) => void;
  /** Pumped by the players' own timers, as in the game; a render pumps them itself (`pump`). */
  readonly timed?: boolean;
  readonly clock?: (audio: BaseAudioContext) => number;
  readonly scores?: () => Scores;
}

/** The game's music, fed each frame with what the game hears. */
export class MusicDirector {
  private readonly output: () => MusicOut | null;
  private readonly duckTo: (level: number, seconds: number) => void;
  private readonly timed: boolean;
  private readonly clockOf: (audio: BaseAudioContext) => number;
  private memory: Memory = QUIET;
  /** Every score, made as the game starts (some 30,000 notes, tens of milliseconds) rather than mid-fight. */
  private readonly scores: Scores;
  private bus: MusicOut | null = null;
  private players: SongPlayer[] = [];
  private stinger: SongPlayer | null = null;
  private current: { player: SongPlayer; song: Song; roles: ReadonlySet<Role>; level: number } | null = null;
  /** A sting plays until then: nothing else begins before it ends but a song that gives it way (`waking` false). */
  private holdUntil = -Infinity;
  private waking = false;
  private ducked = 1;

  constructor({
    output = musicOutput,
    duck = duckAmbience,
    timed = true,
    clock = (audio) => audio.currentTime,
    scores = overlookScores,
  }: DirectorOptions = {}) {
    [this.output, this.duckTo, this.timed, this.clockOf, this.scores] = [output, duck, timed, clock, scores()];
    // A hidden page's timers are slowed to a wake a second, too few to keep a song whole: it falls silent instead.
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.hush();
      });
  }

  /** One frame, `seconds` after the last. */
  frame(hearing: Hearing, seconds: number): void {
    const verdict = hear(this.memory, hearing, seconds);
    this.memory = verdict.memory;
    const bus = this.output();
    if (!bus) return this.hush();
    if (bus.out !== this.bus?.out) this.wire(bus);
    const now = this.clockOf(bus.audio);
    const { scores } = this;
    if (this.stinger?.song && this.stinger.finished(now)) this.stinger.stop();
    if (verdict.sting) this.sting(stingOf(scores, verdict.sting), verdict.sting.kind === 'wake', now);
    const song = songOf(scores, verdict.cue);
    const social = verdict.cue.kind === 'social';
    const roles = social ? ALL_ROLES : MOOD_ROLES[verdict.mood];
    this.follow(song, roles, social ? 1 : MOOD_LEVEL[verdict.mood], now);
    const under = !song ? 1 : social ? SOCIAL_DUCK : MOOD_DUCK[verdict.mood];
    // A sting is music too: the ambience stays lowered under it.
    this.duck(now < this.holdUntil ? Math.min(under, MOOD_DUCK.combat) : under);
  }

  /** A frame on foot in `node` of `world`, from the fight it showed. */
  onFoot(
    world: Parameters<typeof hearNode>[0],
    node: Parameters<typeof hearNode>[1],
    fight: FootHeard,
    seconds: number,
  ) {
    this.frame(hearNode(world, node, fight), seconds);
  }

  /** A frame at sea. */
  atSea(sea: SeaHeard, seconds: number): void {
    this.frame(hearSea(sea), seconds);
  }

  /** Pumps every player to `now`, for a render that runs no timers. */
  pump(now: number): void {
    for (const player of [...this.players, this.stinger]) player?.pump(now);
  }

  /** The players, on a new bus: three for songs giving way to each other, one for stings. */
  private wire(bus: MusicOut): void {
    this.hush();
    this.bus = bus;
    const clock = () => this.clockOf(bus.audio);
    const out = ceilingOn(bus.audio, bus.out);
    const make = () => new SongPlayer(bus.audio, out, { timed: this.timed, clock });
    this.players = [make(), make(), make()];
    this.stinger = make();
  }

  /** A player free for a new song: an idle one, else the one whose fade ends first. */
  private free(now: number): SongPlayer {
    const idle = this.players.find((player) => player !== this.current?.player && player.idle(now));
    if (idle) return idle;
    const fading = this.players.filter((player) => player !== this.current?.player);
    fading.sort((one, other) => (one.fadingUntil ?? Infinity) - (other.fadingUntil ?? Infinity));
    return fading[0] ?? this.players[0];
  }

  /** Plays `song` in `roles` at `level`, on bar lines. */
  private follow(song: Song | null, roles: ReadonlySet<Role>, level: number, now: number): void {
    // A new fight cuts a sting short on its bar line, but a wake runs into the song it leads to.
    const stinging = this.stinger?.song;
    if (song && roles.has('combat') && stinging && now < this.holdUntil && !this.waking && this.stinger) {
      this.holdUntil = this.stinger.nextBar(now);
      this.stinger.fade(0, this.holdUntil, beatOf(stinging));
    }
    const playing = this.current;
    if (!song) {
      if (playing) playing.player.fade(0, playing.player.nextBar(now), RESOLVE_BARS * barOf(playing.song));
      this.current = null;
      return;
    }
    // A song still fading out is brought back where it stands, never begun again over itself.
    const fading = playing ? null : this.players.find((player) => player.song === song && !player.idle(now));
    const same =
      playing?.song === song ? playing : fading ? { player: fading, song, roles: ALL_ROLES, level: 0 } : null;
    if (same) {
      if (same.roles === roles && same.level === level) return;
      const when = same.player.nextBar(now);
      same.player.setRoles(roles, when);
      same.player.fade(level, when, beatOf(song));
      this.current = { ...same, roles, level };
      return;
    }
    // A song not yet begun is replaced where it would have begun; one playing, or still fading, gives way on its next
    // bar line, so two songs never sound out of step.
    const waiting = playing?.player.waiting(now) ? playing.player : null;
    const leaving = playing?.player ?? this.players.find((player) => player.song && !player.idle(now));
    const when = waiting
      ? waiting.startsAt
      : leaving
        ? leaving.nextBar(now)
        : Math.max(now + START_LEAD_S, this.holdUntil);
    const player = waiting ?? this.free(now);
    if (playing && !waiting) playing.player.fade(0, when, beatOf(playing.song));
    player.play(song, Math.max(when, this.holdUntil), { roles, level });
    this.current = { player, song, roles, level };
  }

  /** A sting on the next bar line, the song playing giving way to it; a wake runs straight into what follows it. */
  private sting(song: Song | null, wake: boolean, now: number): void {
    const playing = this.current;
    const when = playing ? playing.player.nextBar(now) : now + START_LEAD_S;
    if (wake && !song) return;
    if (playing) playing.player.fade(0, when, song ? beatOf(playing.song) : RESOLVE_BARS * barOf(playing.song));
    this.current = null;
    if (!song || !this.stinger) return;
    this.stinger.play(song, when, { loop: false });
    this.holdUntil = when + (wake ? songSeconds(song) : songTail(song));
    this.waking = wake;
  }

  private duck(level: number): void {
    if (level === this.ducked) return;
    this.duckTo(level, level < this.ducked ? DUCK_S : UNDUCK_S);
    this.ducked = level;
  }

  /** Falls silent at once, in a tenth of a second: no output, or a hidden page. */
  private hush(): void {
    const bus = this.bus;
    if (bus) {
      const now = this.clockOf(bus.audio);
      for (const player of [...this.players, this.stinger]) if (player?.song) player.fade(0, now, 0.1);
    }
    [this.current, this.holdUntil] = [null, -Infinity];
    this.duck(1);
  }
}
