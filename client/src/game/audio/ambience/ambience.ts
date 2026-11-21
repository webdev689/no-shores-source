// The world's ambience: the sea's, the social space's and each island's by its climate, heard wherever the player is.
// The game tells it each frame where the player stands and looks (`onFoot`, `atSea`) and steps it once (`frame`); it
// plays the place's ambience through the Ambience volume, crossfading over a few seconds as the player moves on, and
// lets every place fade to nothing while the game shows none, behind a loading veil. Its beds and calls are the owner's
// Freesound recordings; until each has come it is silent. Each frame it reads the sky (SKY_NOW): the sun's
// height gives the hour's phases, the weather the wind, rain, snow and sand, and every strike near its thunder.

import { stepsBetween } from '../../../combat/worldCues.ts';
import { SKY_NOW } from '../../../sky/skyDriver.ts';
import { WORLD_CLOCK, hourOf } from '../../../sky/worldClock.ts';
import type { Landmass } from '../../landmass.ts';
import { listen } from '../../../listener.ts';
import { ambienceOutput } from '../../uiSounds.ts';
import type { NodeInfo } from '../../worldData.ts';
import { type Place, placeOf } from '../place.ts';
import type { Random } from './dsp.ts';
import { ambienceOf, fadeGain, nearness, phasesAt, stepLevel, wayOf } from './law.ts';
import { type Lay, shoreOf } from './places.ts';
import { type Heard, MOST_CALLS, ScapePlayer } from './player.ts';
import { type FightHeard, seaFightCue } from './seaFight.ts';
import { phasesOfSun, rainLevel, shelterOf, thunderOf, weatherOf } from './weatherLaw.ts';

/** The ear's height over its deck at sea, metres. */
const DECK_EAR_M = 3;
/** How the deck is heard from the raised view over it: a little way off. */
const DECK_FROM_ABOVE = 0.55;
/** How fast its way and the deck's nearness are followed, seconds. */
const WAY_FOLLOW_S = 2;
const DECK_FOLLOW_S = 1.5;
/** The sea's nearness: whole within the first distance, none past the second; at sea, then on foot, metres. */
const COAST_AT_SEA: readonly [number, number] = [600, 3000];
const COAST_ON_FOOT: readonly [number, number] = [60, 500];
/** Thunder is set playing this long before it arrives, seconds, and is let go if it is found this long late (a hidden
 *  page's frames stop). */
const THUNDER_AHEAD_S = 0.25;
const THUNDER_LATE_S = 1.5;
/** The feet moved farther than this in a frame, metres, were set down elsewhere rather than walked. */
const STRIDE_MOST_M = 2;

/** Where the ambience plays: a context and the node it goes into; null while it may not sound. */
export type AmbienceOutput = () => { readonly audio: BaseAudioContext; readonly out: AudioNode } | null;

/** The camera as the ambience hears it: the eye in world metres (east, south, up) and its yaw, clockwise from north. */
interface Ear {
  readonly eye: readonly [number, number, number];
  readonly yaw: number;
}

/** What it knows of a landmass's land. */
function layOf(land: Landmass): Lay {
  const plan = land.plan;
  const stations = plan?.social.stations ?? [];
  const keeper = stations.find(({ kind }) => kind === 'weaponsmith')?.keeper;
  return {
    heightAt: land.heightAt,
    outline: land.outline,
    rivers: land.view.rivers,
    harbour: plan?.harbour ?? null,
    city: plan?.centre ?? null,
    plaza: plan ? { bounds: plan.social.bounds, level: plan.social.level } : null,
    smithy: plan && keeper ? [keeper[0], keeper[1], plan.social.level + 1.2] : null,
  };
}

export class Ambience {
  private readonly continents: Parameters<typeof placeOf>[0];
  private readonly output: AmbienceOutput;
  private readonly random: Random;
  /** A fixed hour, for the sound sheet and tests; else the sky's. */
  private readonly hour: number | null;
  /** The strikes whose thunder is set playing or let go. */
  private thundered = new Set<string>();
  /** The player's feet aboard, in its deck's frame, and the metres walked there. */
  private feet: { x: number; y: number; walked: number } | null = null;
  private stepped = false;
  private readonly lays = new WeakMap<Landmass, Lay>();
  private readonly calls = { count: 0 };
  private players: ScapePlayer[] = [];
  private context: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private heard: Heard | null = null;
  private lastHeard: Heard | null = null;
  private clock = 0;
  private way = 0;
  private deck = 1;
  private hidden = false;
  /** The sea fight's events since the last frame, heard where each happens. */
  private fought: FightHeard | null = null;

  constructor(
    continents: Parameters<typeof placeOf>[0],
    output: AmbienceOutput = ambienceOutput,
    options: { readonly hour?: number; readonly random?: Random } = {},
  ) {
    [this.continents, this.output] = [continents, output];
    this.random = options.random ?? Math.random;
    this.hour = options.hour ?? null;
    // A hidden page hears nothing: its frames stop, so the fade is the page's own event's.
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.hidden;
        if (this.master && this.context)
          this.master.gain.setTargetAtTime(this.hidden ? 0 : 1, this.context.currentTime, 0.15);
      });
  }

  /** The player on foot in `node` of `land`, the camera at `ear`, a social space's people walking about. */
  onFoot(node: NodeInfo, land: Landmass, ear: Ear, folk: Heard['folk'] = []): void {
    const lay = this.layOf(land);
    const shore = shoreOf([ear.eye[0], ear.eye[1]], lay.outline);
    this.hear(placeOf(this.continents, node), ear.eye, ear.yaw, [0, 0], lay, {
      coast: nearness(shore?.distance ?? Infinity, ...COAST_ON_FOOT),
      folk,
    });
  }

  /** The player's ship at sea at `ship` off `land`, the camera looking along `ear`'s yaw; under way at its pace or
   *  not, the view on its deck or over it, and the player's feet in its deck's frame, which step on its planks as
   *  they walk its deck. */
  atSea(
    land: Landmass,
    ship: readonly [number, number],
    ear: Ear,
    voyage: {
      readonly sailing: boolean;
      readonly pace: number;
      readonly deck: boolean;
      readonly feet?: { readonly x: number; readonly y: number; readonly mode: string };
      readonly fightHeard?: FightHeard | null;
    },
    seconds = 1 / 60,
  ): void {
    this.walk(voyage.feet);
    this.fought = voyage.fightHeard ?? null;
    const lay = this.layOf(land);
    const shore = shoreOf(ship, lay.outline);
    this.way += (wayOf(voyage.sailing, voyage.pace) - this.way) * Math.min(1, seconds / WAY_FOLLOW_S);
    this.deck += ((voyage.deck ? 1 : DECK_FROM_ABOVE) - this.deck) * Math.min(1, seconds / DECK_FOLLOW_S);
    const coast = nearness(shore?.distance ?? Infinity, ...COAST_AT_SEA);
    this.hear({ kind: 'sea' }, [ship[0], ship[1], DECK_EAR_M], ear.yaw, ship, lay, { coast, folk: [] });
  }

  /** Steps the ambience `seconds` on: the place heard this frame, or none, fades in and every other fades out. */
  frame(seconds: number): void {
    this.clock += seconds;
    const heard = this.heard;
    this.heard = null;
    const output = this.output();
    if (!output) {
      this.stopAll();
      return;
    }
    if (output.audio !== this.context) {
      this.stopAll();
      this.context = output.audio;
      this.master = output.audio.createGain();
      this.master.gain.value = this.hidden ? 0 : 1;
      this.master.connect(output.out);
    }
    const { context: audio, master } = this;
    if (!audio || !master) return;
    for (const player of this.players) player.target = player.key === heard?.key ? 1 : 0;
    if (heard && !this.players.some((player) => player.key === heard.key))
      this.players.push(new ScapePlayer(audio, master, heard.key, this.random, this.calls));
    if (heard) {
      const [east, south, up] = heard.ear;
      listen(audio, [east, south, up], heard.yaw, heard.origin);
      this.lastHeard = heard;
    }
    const now = audio.currentTime;
    const still = this.lastHeard;
    for (const player of this.players) {
      player.level = stepLevel(player.level, player.target, seconds);
      player.gain.gain.setTargetAtTime(fadeGain(player.level) * player.scape.level, now, 0.05);
      if (still) player.frame(this.clock, still, player.target === 1 && heard !== null);
    }
    const live = heard ? this.players.find((player) => player.key === heard.key) : undefined;
    if (heard) this.thunder(heard, live);
    if (heard && live && this.stepped && heard.key === 'sea') live.footstep(heard);
    this.stepped = false;
    const fought = this.fought;
    this.fought = null;
    if (heard && live && fought)
      for (const event of fought.events) {
        const sound = seaFightCue(event, fought.view);
        if (sound) live.fight(sound.cue, sound.at, heard);
      }
    const gone = this.players.filter((player) => player.level === 0 && player.target === 0);
    if (gone.length === 0) return;
    for (const player of gone) player.stop();
    this.players = this.players.filter((player) => !gone.includes(player));
  }

  /** What it is playing: the places sounding, their beds playing recordings, and the calls sounding. */
  get stats(): {
    readonly places: number;
    readonly sources: number;
    readonly calls: number;
    readonly mostCalls: number;
  } {
    return {
      places: this.players.length,
      sources: this.players.reduce((sum, player) => sum + player.sources, 0),
      calls: this.calls.count,
      mostCalls: MOST_CALLS,
    };
  }

  private layOf(land: Landmass): Lay {
    const kept = this.lays.get(land);
    if (kept) return kept;
    const lay = layOf(land);
    this.lays.set(land, lay);
    return lay;
  }

  private hear(
    place: Place,
    ear: readonly [number, number, number],
    yaw: number,
    origin: readonly [number, number],
    lay: Lay,
    more: { readonly coast: number; readonly folk: Heard['folk'] },
  ): void {
    const way = place.kind === 'sea' ? this.way : 0;
    const deck = place.kind === 'sea' ? this.deck : 1;
    const { reading } = SKY_NOW.current;
    const phases =
      this.hour !== null
        ? phasesAt(this.hour)
        : reading
          ? phasesOfSun(reading.sun)
          : phasesAt(hourOf(WORLD_CLOCK.seconds()));
    const weather = weatherOf(reading);
    this.heard = {
      key: ambienceOf(place),
      ear,
      yaw,
      origin,
      lay,
      phases,
      drives: {
        way,
        still: 1 - way,
        coast: more.coast,
        deck,
        wind: weather.wind,
        rain: rainLevel(weather.rain),
        sand: weather.sand,
      },
      weather,
      shelter: shelterOf(weather, phases),
      folk: more.folk,
    };
  }

  /** The player's feet aboard: each stride walked on its planks is a step, once the ambience is heard at sea. */
  private walk(feet: { readonly x: number; readonly y: number; readonly mode: string } | undefined): void {
    const kept = this.feet;
    if (!feet) {
      this.feet = null;
      return;
    }
    const moved = kept ? Math.hypot(feet.x - kept.x, feet.y - kept.y) : Infinity;
    const walked = (kept?.walked ?? 0) + (moved <= STRIDE_MOST_M && feet.mode === 'ground' ? moved : 0);
    if (kept && stepsBetween(kept.walked, walked) > 0) this.stepped = true;
    this.feet = { x: feet.x, y: feet.y, walked };
  }

  /** Each strike's thunder, set playing as it arrives at the ear through the place heard. */
  private thunder(heard: Heard, player: ScapePlayer | undefined): void {
    const { strikes, worldS } = SKY_NOW.current;
    for (const strike of strikes) {
      const name = `${strike.atS}:${strike.x}:${strike.y}`;
      if (this.thundered.has(name)) continue;
      const thunder = thunderOf(strike, [heard.ear[0], heard.ear[1]]);
      const after = thunder ? thunder.arrivesS - worldS : -Infinity;
      if (after > THUNDER_AHEAD_S) continue;
      this.thundered.add(name);
      if (thunder && player && after > -THUNDER_LATE_S) player.thunder(thunder, heard, Math.max(0, after));
    }
    // Only the strikes the sky still keeps are remembered; one still on its way is never forgotten.
    if (this.thundered.size > strikes.length + 64) {
      const kept = new Set(strikes.map((strike) => `${strike.atS}:${strike.x}:${strike.y}`));
      this.thundered = new Set([...this.thundered].filter((name) => kept.has(name)));
    }
  }

  private stopAll(): void {
    for (const player of this.players) player.stop();
    this.players = [];
    this.master?.disconnect();
    [this.context, this.master] = [null, null];
  }
}
