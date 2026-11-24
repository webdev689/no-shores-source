// A Breach's moments as the page hears and tells them, from the room's events (judging.rs EventKind): which are the
// player's (the room tells most to every player, so the page takes only its own player's copy); each heard once, at
// its place where it names one (a bell, a mooring, a rift, a desk, a Keeper's shore, the player it marks), every bell
// waking at its own note; the music's sting and the banner's beat; and the company's moments in words, a wipe saying
// why where the page knows it. The room judges every one.
import { EVENT } from '../combat/cues.ts';
import type { BannerBeat } from '../combat/publicBanner.ts';
import { BREACH_EVENT, type BreachSeen } from '../network/breachMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import { type BreachPlan, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER, momentWords, shutOutWords, unwrittenBy } from './breachWords.ts';

type Point = readonly [number, number, number];

/** A moment heard: its recording, where, and how fast it plays (1 as recorded; a bell's note). */
export interface Heard {
  readonly cue: string;
  readonly at: Point;
  readonly rate?: number;
}

/** The recordings each moment plays where it happens, reused from the world's own. */
const SOUNDS: Readonly<Record<number, string>> = {
  [BREACH_EVENT.begun]: 'foe.alert',
  [BREACH_EVENT.stage]: 'amb.ice.crack',
  [BREACH_EVENT.won]: 'story.crash',
  [BREACH_EVENT.revived]: 'anima.divine',
  [BREACH_EVENT.rewritten]: 'element.cosmic',
  [BREACH_EVENT.cleansed]: 'finish.cosmic',
  [BREACH_EVENT.carried]: 'element.cosmic',
  [BREACH_EVENT.unwritten]: 'story.thud',
  [BREACH_EVENT.lodestoneTaken]: 'ship.ready',
  [BREACH_EVENT.lodestoneDropped]: 'story.thud',
  [BREACH_EVENT.grounded]: 'amb.thunder.crack',
  [BREACH_EVENT.heldTrue]: 'anima.divine',
  [BREACH_EVENT.bellWoke]: 'element.cosmic',
  [BREACH_EVENT.bellBroken]: 'shield.break',
  [BREACH_EVENT.bellRang]: 'amb.thunder.crack',
  [BREACH_EVENT.fused]: 'amb.ice.crack',
  [BREACH_EVENT.overtaken]: 'hit.blunt',
  [BREACH_EVENT.claimed]: 'foe.alert',
  [BREACH_EVENT.deskMarked]: 'foe.alert',
  [BREACH_EVENT.blotted]: 'finish.cosmic',
  [BREACH_EVENT.wroteItself]: 'story.thud',
  [BREACH_EVENT.seen]: 'foe.alert',
  [BREACH_EVENT.riftOpened]: 'element.cosmic',
  [BREACH_EVENT.riftClosed]: 'amb.ice.crack',
  [BREACH_EVENT.keeperFell]: 'kill',
  [BREACH_EVENT.tolled]: 'amb.thunder.crack',
  [BREACH_EVENT.taken]: 'element.cosmic',
  [BREACH_EVENT.wayBack]: 'finish.cosmic',
  [BREACH_EVENT.returned]: 'ship.ready',
  [BREACH_EVENT.laidBare]: 'shield.break',
};
/** The music's moment for a moment of the run: a cadence as an encounter begins or its great foe wakes (as an Elite
 *  Dungeon's Boss does), victory as one is won or the Breach cleared, defeat as an attempt is lost. */
const STINGS: Readonly<Record<number, 'cadence' | 'victory' | 'defeat'>> = {
  [BREACH_EVENT.begun]: 'cadence',
  [EVENT.bossWoke]: 'cadence',
  [BREACH_EVENT.won]: 'victory',
  [BREACH_EVENT.cleared]: 'victory',
  [BREACH_EVENT.wiped]: 'defeat',
};
/** The moments the room tells once, of one player (`defender`), the gate shutting one out among them; every other it
 *  tells each player in the room, so the page takes only its own player's. */
const TOLD_ONCE: ReadonlySet<number> = new Set([
  BREACH_EVENT.revived,
  BREACH_EVENT.cleansed,
  BREACH_EVENT.carried,
  BREACH_EVENT.lodestoneTaken,
  BREACH_EVENT.lodestoneDropped,
  BREACH_EVENT.grounded,
  BREACH_EVENT.heldTrue,
  BREACH_EVENT.overtaken,
  BREACH_EVENT.shutOut,
]);
/** The Waking's own moments at the gate, heard and told only by its company and those in its hollow. */
const WAKING: ReadonlySet<number> = new Set([BREACH_EVENT.begun, BREACH_EVENT.won, BREACH_EVENT.wiped]);
/** Each bell's note by its place, semitones over the recording: a major scale, so the order is heard as it is seen. */
const NOTES = [0, 2, 4, 5, 7, 9, 11] as const;
/** The Shores' rifts in the hall, by their number. */
const RIFTS = ['rift-was', 'rift-is'] as const;

/** Where a frame's moments are placed: the player (their number and feet), each fighter as drawn, and at the gate in
 *  the zone its middle and its moorings by number (none in the run, or before the zone's layout says). */
export interface MomentPlaces {
  readonly own: number;
  readonly feet: Point;
  readonly where: (id: number) => Point | null;
  readonly gate: Point | null;
  readonly mooring: (nth: number) => Point | null;
}

/** The moments of `events` the player has: each the room tells once, and their own copy of every other; at the gate,
 *  the Waking's only where they `hear` it (as its company, or in its hollow). */
export const momentsHad = (events: readonly FightEvent[], own: number, hears: boolean): FightEvent[] =>
  events.filter((event) => (TOLD_ONCE.has(event.kind) || event.defender === own) && (hears || !WAKING.has(event.kind)));

/** The banner's beat for a frame's moments: a stage as an encounter begins or moves on, won, or an attempt lost. */
export function beatOf(had: readonly FightEvent[]): BannerBeat | null {
  const has = (kind: number) => had.some((event) => event.kind === kind);
  if (has(BREACH_EVENT.begun) || has(BREACH_EVENT.stage)) return 'stage';
  return has(BREACH_EVENT.won) ? 'won' : has(BREACH_EVENT.wiped) ? 'failed' : null;
}

/** The music's moment for a frame's moments: the last of them that has one. */
export const stingOf = (had: readonly FightEvent[]) =>
  had.reduce<'cadence' | 'victory' | 'defeat' | null>((last, event) => STINGS[event.kind] ?? last, null);

/** Each of a frame's moments heard once where it happens (`placeOf`); the Rewritten of a frame once between them, at
 *  the player where they are among them, else at the first; each bell waking at its place's note. */
export function momentSounds(
  plan: BreachPlan,
  seen: BreachSeen,
  had: readonly FightEvent[],
  places: MomentPlaces,
): Heard[] {
  const rewritten = had.filter((event) => event.kind === BREACH_EVENT.rewritten);
  const marked = rewritten.find((event) => Math.round(event.amount) === places.own) ?? rewritten[0];
  return had.flatMap((event): Heard[] => {
    const cue = SOUNDS[event.kind];
    if (!cue || (event.kind === BREACH_EVENT.rewritten && event !== marked)) return [];
    const place = placeOf(plan, seen, event, places);
    const note = NOTES[Math.round(event.amount) % NOTES.length] ?? 0;
    return [event.kind === BREACH_EVENT.bellWoke ? { cue, at: place, rate: 2 ** (note / 12) } : { cue, at: place }];
  });
}

/** Where a moment is heard: where the one it tells of stands, the place its number names (a bell's, a mooring, a rift,
 *  a Keeper's shore, a desk, the player marked or seen), the gate for the Waking's own, or else at the player's feet. */
function placeOf(plan: BreachPlan, seen: BreachSeen, event: FightEvent, places: MomentPlaces): Point {
  const { feet, where } = places;
  const player = (id: number) => (id === places.own ? feet : (where(id) ?? feet));
  if (TOLD_ONCE.has(event.kind)) return where(event.defender) ?? where(event.striker) ?? feet;
  const nth = Math.round(event.amount);
  const bells = seen.encounter === ENCOUNTER.steward ? plan.shores['steward']?.[seen.awayShore] : 'choir';
  switch (event.kind) {
    case BREACH_EVENT.bellWoke:
    case BREACH_EVENT.bellBroken:
      return (bells && spaceSocket(plan, bells, `bell-${nth + 1}`)) || feet;
    case BREACH_EVENT.claimed:
      return places.mooring(nth) ?? feet;
    case BREACH_EVENT.riftOpened:
    case BREACH_EVENT.riftClosed:
      return spaceSocket(plan, 'hall', RIFTS[nth] ?? '') ?? feet;
    case BREACH_EVENT.keeperFell:
      return spaceSocket(plan, plan.shores['shores']?.[nth] ?? '', 'keeper') ?? feet;
    case BREACH_EVENT.deskMarked:
    case BREACH_EVENT.blotted:
      return spaceSocket(plan, 'choir', `lectern-${nth + 1}`) ?? feet;
    case BREACH_EVENT.rewritten:
    case BREACH_EVENT.seen:
      return player(nth);
    default:
      return seen.gate && WAKING.has(event.kind) ? (places.gate ?? feet) : feet;
  }
}

/** The moments the page tells in words, holding why the company was last unwritten whole for its wipe's words. */
export class MomentWords {
  private cause: string | null = null;

  /** The words for a frame's moments (`had`), the room's word now and the frame before: the company's moments where
   *  the player is of it (`ours`), `nameOf` naming each; and the gate shutting them out wherever they stand. A wipe
   *  says why: the last cause of the company unwritten whole, or else `lost` (the Waking's Spire left empty). */
  words(
    plan: BreachPlan,
    { seen, before, had }: { seen: BreachSeen; before: BreachSeen | null; had: readonly FightEvent[] },
    { ours, nameOf, lost }: { ours: boolean; nameOf: (player: number) => string; lost: string | null },
  ): string[] {
    return had.flatMap((event) => {
      if (event.kind === BREACH_EVENT.shutOut) return [shutOutWords(plan, seen.tier, Math.round(event.amount))];
      if (event.kind === BREACH_EVENT.begun) this.cause = null;
      const cause = event.kind === BREACH_EVENT.unwritten ? unwrittenBy(before, seen) : null;
      if (cause) this.cause = cause;
      const why = event.kind === BREACH_EVENT.wiped ? (this.cause ?? lost) : cause;
      if (event.kind === BREACH_EVENT.wiped) this.cause = null;
      const words = ours ? momentWords(event, nameOf, why) : null;
      return words ? [words] : [];
    });
  }
}
