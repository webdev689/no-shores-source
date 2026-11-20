// The world's ambience: the sea's, the social space's and each island's by its climate, heard wherever the player is.
// The game tells it each frame where the player stands and looks (`onFoot`, `atSea`) and steps it once (`frame`); it
// plays the place's ambience through the Ambience volume, crossfading over a few seconds as the player moves on, and
// lets every place fade to nothing while the game shows none, behind a loading veil. Its beds and calls are made in a
// worker as the place is first heard; until they come it is silent. The game has no clock of its own and its sun
// stands fixed in the afternoon, so every place sounds as it does by day.

import { listen } from '../../../combat/worldSounds.ts';
import type { Landmass } from '../../landmass.ts';
import { ambienceOutput } from '../../uiSounds.ts';
import type { NodeInfo } from '../../worldData.ts';
import { type Place, placeOf } from '../place.ts';
import { Bank } from './bank.ts';
import type { Random } from './dsp.ts';
import { type AmbienceKey, ambienceOf, fadeGain, nearness, phasesAt, stepLevel, wayOf } from './law.ts';
import { type Lay, shoreOf } from './places.ts';
import { type Heard, MOST_CALLS, ScapePlayer, jobsOf } from './player.ts';
import { SCAPES } from './scapes.ts';
import { jobName } from './sounds.ts';

/** The hour every place is heard at: the sky's sun stands fixed at the afternoon's height. */
export const GAME_HOUR = 15;
/** The ear's height over her deck at sea, metres. */
const DECK_EAR_M = 3;
/** How the deck is heard from the raised view over her: a little way off. */
const DECK_FROM_ABOVE = 0.55;
/** How fast her way and the deck's nearness are followed, seconds. */
const WAY_FOLLOW_S = 2;
const DECK_FOLLOW_S = 1.5;
/** The sea's nearness: whole within the first distance, none past the second; at sea, then on foot, metres. */
const COAST_AT_SEA: readonly [number, number] = [600, 3000];
const COAST_ON_FOOT: readonly [number, number] = [60, 500];

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
  const keeper = (stations.find(({ kind }) => kind === 'smith') ?? stations.find(({ kind }) => kind === 'armsmith'))
    ?.keeper;
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
  private readonly bank: Bank;
  private readonly random: Random;
  private readonly hour: number;
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
  /** The place whose sounds were last asked for. */
  private wanted: AmbienceKey | null = null;

  constructor(
    continents: Parameters<typeof placeOf>[0],
    output: AmbienceOutput = ambienceOutput,
    options: { readonly hour?: number; readonly random?: Random; readonly bank?: Bank } = {},
  ) {
    [this.continents, this.output] = [continents, output];
    this.bank = options.bank ?? new Bank();
    this.random = options.random ?? Math.random;
    this.hour = options.hour ?? GAME_HOUR;
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

  /** The player's ship at sea at `ship` off `land`, the camera looking along `ear`'s yaw; under way at her pace or
   *  not, and the view on her deck or over her. */
  atSea(
    land: Landmass,
    ship: readonly [number, number],
    ear: Ear,
    voyage: { readonly sailing: boolean; readonly pace: number; readonly deck: boolean },
    seconds = 1 / 60,
  ): void {
    const lay = this.layOf(land);
    const shore = shoreOf(ship, lay.outline);
    this.way += (wayOf(voyage.sailing, voyage.pace) - this.way) * Math.min(1, seconds / WAY_FOLLOW_S);
    this.deck += ((voyage.deck ? 1 : DECK_FROM_ABOVE) - this.deck) * Math.min(1, seconds / DECK_FOLLOW_S);
    const coast = nearness(shore?.distance ?? Infinity, ...COAST_AT_SEA);
    this.hear({ kind: 'sea' }, [ship[0], ship[1], DECK_EAR_M], ear.yaw, ship, lay, { coast, folk: [] });
  }

  /** Makes every bed and call a place needs ahead of its being heard; resolves once all are made. */
  prepare(key: AmbienceKey): Promise<void> {
    const jobs = jobsOf(SCAPES[key]);
    for (const job of jobs) this.bank.want(job);
    const pumping = setInterval(() => this.bank.pump(), 5);
    return this.bank.whenMade(jobs).finally(() => clearInterval(pumping));
  }

  /** Steps the ambience `seconds` on: the place heard this frame, or none, fades in and every other fades out. */
  frame(seconds: number): void {
    this.clock += seconds;
    const heard = this.heard;
    this.heard = null;
    // A place's sounds are made as soon as it is heard, before the first press wakes the page's sound.
    if (heard && heard.key !== this.wanted) {
      this.wanted = heard.key;
      for (const job of jobsOf(SCAPES[heard.key])) this.bank.want(job);
    }
    this.bank.pump();
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
      this.players.push(new ScapePlayer(audio, master, heard.key, this.bank, this.random, this.calls));
    if (heard) {
      const [east, south, up] = heard.ear;
      listen(audio.listener, [east - heard.origin[0], south - heard.origin[1], up], heard.yaw);
      this.lastHeard = heard;
    }
    const now = audio.currentTime;
    const still = this.lastHeard;
    for (const player of this.players) {
      player.level = stepLevel(player.level, player.target, seconds);
      player.gain.gain.setTargetAtTime(fadeGain(player.level) * player.scape.level, now, 0.05);
      if (still) player.frame(this.clock, still, player.target === 1 && heard !== null);
    }
    const gone = this.players.filter((player) => player.level === 0 && player.target === 0);
    if (gone.length === 0) return;
    for (const player of gone) player.stop();
    this.players = this.players.filter((player) => !gone.includes(player));
    this.bank.keepOnly(new Set(this.players.flatMap((player) => jobsOf(player.scape).map(jobName))));
  }

  /** What it is playing: the places sounding, their bed sources, the calls sounding, and the sounds kept. */
  get stats(): {
    readonly places: number;
    readonly sources: number;
    readonly calls: number;
    readonly mostCalls: number;
    readonly kept: { readonly sounds: number; readonly bytes: number };
  } {
    return {
      places: this.players.length,
      sources: this.players.reduce((sum, player) => sum + player.sources, 0),
      calls: this.calls.count,
      mostCalls: MOST_CALLS,
      kept: this.bank.held,
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
    this.heard = {
      key: ambienceOf(place),
      ear,
      yaw,
      origin,
      lay,
      phases: phasesAt(this.hour),
      drives: { way, still: 1 - way, coast: more.coast, deck },
      folk: more.folk,
    };
  }

  private stopAll(): void {
    for (const player of this.players) player.stop();
    this.players = [];
    this.master?.disconnect();
    [this.context, this.master] = [null, null];
  }
}
