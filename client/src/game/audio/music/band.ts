// The plaza band heard where it plays: each musician's instrument sounds from where they stand, whole close by and
// quieter with distance, silent past `QUIET_M`; the four play one tune together (`bandScore.ts`). Near them the
// social space's own theme gives way, so the two are never heard over each other.

import { type Instrument, INSTRUMENTS, bandParts } from './bandScore.ts';
import type { Song } from './score.ts';
import { SongPlayer, START_LEAD_S } from './songPlayer.ts';

type Point = readonly [number, number];

/** How near a musician their instrument sounds whole, and how far off it falls silent, metres. */
export const NEAR_M = 4;
export const QUIET_M = 30;
/** How long the band's instruments take to follow a listener's steps, and to fall silent once none is heard,
 *  seconds. */
const FOLLOW_S = 0.25;
const SILENT_S = 3;

/** A musician as the band hears them: their instrument and where they stand. */
export interface Musician {
  readonly instrument: Instrument;
  readonly place: Point;
}

/** What the band is heard by: its musicians, and where the listener stands. */
export interface BandHeard {
  readonly musicians: readonly Musician[];
  readonly listener: Point;
}

/** How loud an instrument sounds `metres` off, 0 to 1: whole within `NEAR_M`, falling away to nothing at `QUIET_M`. */
export function bandLevel(metres: number): number {
  if (metres <= NEAR_M) return 1;
  if (metres >= QUIET_M) return 0;
  return ((QUIET_M - metres) / (QUIET_M - NEAR_M)) ** 2;
}

/** The musicians among a social space's people: whoever is at an instrument's move (`play_lute`), its instrument. */
export function musiciansOf(folk: readonly { readonly anim: string; readonly x: number; readonly y: number }[]) {
  return folk.flatMap((one): Musician[] => {
    const instrument = INSTRUMENTS.find((each) => one.anim === `play_${each}`);
    return instrument ? [{ instrument, place: [one.x, one.y] }] : [];
  });
}

/** Each instrument's level for a listener: its nearest player's distance; nothing for one no one plays. */
export function bandLevels({ musicians, listener }: BandHeard): Record<Instrument, number> {
  const levels = Object.fromEntries(INSTRUMENTS.map((each) => [each, 0])) as Record<Instrument, number>;
  for (const { instrument, place } of musicians) {
    const level = bandLevel(Math.hypot(place[0] - listener[0], place[1] - listener[1]));
    levels[instrument] = Math.max(levels[instrument], level);
  }
  return levels;
}

/** How loud the social space's theme plays under the band at its loudest `band` level: given way to it as it nears,
 *  by quarters, so the theme's level changes seldom, and never quite to nothing, as a theme faded to nothing stops
 *  and would begin again from its top. */
export const THEME_UNDER_BAND = 0.01;
export function themeUnder(band: number): number {
  return Math.max(THEME_UNDER_BAND, 1 - Math.round(Math.min(1, Math.max(0, band)) * 4) / 4);
}

/** The band's four instruments on the music's bus, each its own player, begun together and faded by distance. */
export class Band {
  private readonly parts: Readonly<Record<Instrument, Song>> = bandParts();
  private readonly players = new Map<Instrument, { player: SongPlayer; level: number }>();
  private playing = false;
  /** How long no instrument has been heard, seconds. */
  private silentS = 0;

  /** The four players, on a new bus. */
  wire(audio: BaseAudioContext, out: AudioNode, options: ConstructorParameters<typeof SongPlayer>[2]): void {
    this.hush(0);
    this.players.clear();
    for (const instrument of INSTRUMENTS)
      this.players.set(instrument, { player: new SongPlayer(audio, out, options), level: 0 });
  }

  /** A frame `seconds` long at `now` on the bus's clock, heard by `heard` (none: no band here); the loudest any
   *  instrument is heard at. */
  frame(heard: BandHeard | null, seconds: number, now: number): number {
    const levels = heard ? bandLevels(heard) : null;
    const loudest = levels ? Math.max(...Object.values(levels)) : 0;
    this.silentS = loudest > 0 ? 0 : this.silentS + seconds;
    if (!this.playing && loudest > 0) {
      // Begun together, so the four keep in step however each is faded.
      for (const [instrument, held] of this.players) {
        held.level = levels?.[instrument] ?? 0;
        held.player.play(this.parts[instrument], now + START_LEAD_S, { level: held.level });
      }
      this.playing = true;
    } else if (this.playing && this.silentS >= SILENT_S) this.hush(now);
    else if (this.playing)
      for (const [instrument, held] of this.players) {
        const level = levels?.[instrument] ?? 0;
        if (Math.abs(level - held.level) < 0.01) continue;
        // Never quite to nothing: a player faded to nothing stops, and the four would fall out of step.
        held.player.fade(Math.max(level, 1e-4), now, FOLLOW_S);
        held.level = level;
      }
    return loudest;
  }

  /** Pumps each player to `now`, for a render that runs no timers. */
  pump(now: number): void {
    for (const { player } of this.players.values()) player.pump(now);
  }

  /** Stops playing, fading out over a tenth of a second from `now`. */
  hush(now: number): void {
    for (const { player } of this.players.values()) if (player.song) player.fade(0, now, 0.1);
    this.playing = false;
  }
}
