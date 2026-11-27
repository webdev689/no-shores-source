// A Breach's moments as the page hears and tells them, from the room's events (judging.rs EventKind): which are the
// player's (the room tells most to every player, so the page takes only its own player's copy); each heard once, at
// its place where it names one (a bell, a mooring, a rift, a desk, a Keeper's shore, the player it marks), every bell
// waking at its own note, each by its own recording (`breach.*`) once the owner has picked it and by the world's it
// borrowed until then; what the room tells by its state (a slab rising or sinking, a mooring held); the music's sting
// and the banner's beat; and the company's moments in words, a wipe saying why where the page knows it. The room
// judges every one.
import { EVENT } from '../combat/cues.ts';
import { recorded } from '../soundSamples.ts';
import type { HeardSound as Heard } from '../combat/worldSounds.ts';
import type { BannerBeat } from '../combat/publicBanner.ts';
import { BREACH_EVENT, type BreachSeen } from '../network/breachMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import { chestOf } from './breachCounts.ts';
import { type BreachPlan, slabStands, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER, type Mooring, momentWords, shutOutWords, unwrittenBy } from './breachWords.ts';

type Point = readonly [number, number, number];

/** Each moment's own recording (content/audio/freesound.json's `breach.*`), and the world's it plays until its own is
 *  picked (none where it was silent). A player carried into a shore is plunged under as the taken are. */
export const MOMENT_CUES: Readonly<Record<number, { readonly cue: string; readonly until: string | null }>> = {
  [BREACH_EVENT.begun]: { cue: 'breach.begun', until: 'foe.alert' },
  [BREACH_EVENT.stage]: { cue: 'breach.stage', until: 'amb.ice.crack' },
  [BREACH_EVENT.won]: { cue: 'breach.seal', until: 'story.crash' },
  [BREACH_EVENT.wiped]: { cue: 'breach.wipe', until: 'story.thud' },
  [BREACH_EVENT.rewritten]: { cue: 'breach.rewritten', until: 'element.cosmic' },
  [BREACH_EVENT.cleansed]: { cue: 'breach.cleansed', until: 'finish.cosmic' },
  [BREACH_EVENT.carried]: { cue: 'breach.taken', until: 'element.cosmic' },
  [BREACH_EVENT.unwritten]: { cue: 'breach.unwritten', until: 'story.thud' },
  [BREACH_EVENT.lodestoneTaken]: { cue: 'breach.stone.take', until: 'ship.ready' },
  [BREACH_EVENT.lodestoneDropped]: { cue: 'breach.stone.drop', until: 'story.thud' },
  [BREACH_EVENT.grounded]: { cue: 'breach.stone.ground', until: 'amb.thunder.crack' },
  [BREACH_EVENT.heldTrue]: { cue: 'breach.stone.hold', until: 'anima.divine' },
  [BREACH_EVENT.bellWoke]: { cue: 'breach.bell.wake', until: 'element.cosmic' },
  [BREACH_EVENT.bellBroken]: { cue: 'breach.bell.break', until: 'shield.break' },
  [BREACH_EVENT.bellRang]: { cue: 'breach.bell.ring', until: 'amb.thunder.crack' },
  [BREACH_EVENT.fused]: { cue: 'breach.fused', until: 'amb.ice.crack' },
  [BREACH_EVENT.overtaken]: { cue: 'breach.overtaken', until: 'hit.blunt' },
  [BREACH_EVENT.claimed]: { cue: 'breach.claimed', until: 'foe.alert' },
  [BREACH_EVENT.deskMarked]: { cue: 'breach.desk.marked', until: 'foe.alert' },
  [BREACH_EVENT.blotted]: { cue: 'breach.blotted', until: 'finish.cosmic' },
  [BREACH_EVENT.wroteItself]: { cue: 'breach.wrote', until: 'story.thud' },
  [BREACH_EVENT.seen]: { cue: 'breach.seen', until: 'foe.alert' },
  [BREACH_EVENT.riftOpened]: { cue: 'breach.rift.open', until: 'element.cosmic' },
  [BREACH_EVENT.riftClosed]: { cue: 'breach.rift.shut', until: 'amb.ice.crack' },
  [BREACH_EVENT.keeperFell]: { cue: 'breach.keeper.fell', until: 'kill' },
  [BREACH_EVENT.tolled]: { cue: 'breach.toll', until: 'amb.thunder.crack' },
  [BREACH_EVENT.taken]: { cue: 'breach.taken', until: 'element.cosmic' },
  [BREACH_EVENT.wayBack]: { cue: 'breach.way.back', until: 'finish.cosmic' },
  [BREACH_EVENT.returned]: { cue: 'breach.returned', until: 'ship.ready' },
  [BREACH_EVENT.laidBare]: { cue: 'breach.laid.bare', until: 'shield.break' },
};
/** What the room tells by its state rather than by an event, and the hidden chest opened to the player: each by its
 *  own recording alone, silent until it is picked (no world sound stands in for them). */
export const STATE_CUES = {
  slab: 'breach.slab',
  mooring: 'breach.mooring',
  chest: 'breach.chest',
  woken: 'breach.spire.woken',
} as const;
/** The moments heard whole and from afar: long recordings (a toll rings 3 to 15 s, a bell 2 to 10 s) and the far
 *  ones (the Choir's last bell stands 64 m from its stage). */
const WHOLE: ReadonlySet<string> = new Set([
  'breach.begun',
  'breach.seal',
  'breach.wipe',
  'breach.bell.wake',
  'breach.bell.ring',
  'breach.bell.break',
  'breach.toll',
  'breach.rift.open',
  'breach.rift.shut',
  'breach.keeper.fell',
  'breach.laid.bare',
  'breach.spire.woken',
]);
/** The most room ticks between two frames for a slab's change between them to be heard: a second's. */
const SLAB_GAP_TICKS = 60;

/** A recording heard at `where`: the moment's own once picked (`picked`), else the world's it borrows; none for
 *  neither. */
export function heardOf(
  sound: { readonly cue: string; readonly until: string | null },
  where: Point,
  picked: (cue: string) => boolean = recorded,
): Heard | null {
  const cue = picked(sound.cue) ? sound.cue : sound.until;
  if (!cue) return null;
  return WHOLE.has(sound.cue) ? { cue, at: where, whole: true } : { cue, at: where };
}

/** The music's moment for a moment of the run: a cadence as an encounter begins or its great foe wakes (as an Elite
 *  Dungeon's Boss does), victory as one is won, defeat as an attempt is lost. The Breach cleared plays none: the
 *  room tells it at the gate, where no one who cleared it stands. */
const STINGS: Readonly<Record<number, 'cadence' | 'victory' | 'defeat'>> = {
  [BREACH_EVENT.begun]: 'cadence',
  [EVENT.bossWoke]: 'cadence',
  [BREACH_EVENT.won]: 'victory',
  [BREACH_EVENT.wiped]: 'defeat',
};
/** The moments the room tells once, of one player (`defender`); every other it tells each player in the room (the
 *  gate shutting one out, to them alone), so the page takes only its own player's. */
const TOLD_ONCE: ReadonlySet<number> = new Set([
  BREACH_EVENT.cleansed,
  BREACH_EVENT.carried,
  BREACH_EVENT.lodestoneTaken,
  BREACH_EVENT.lodestoneDropped,
  BREACH_EVENT.grounded,
  BREACH_EVENT.heldTrue,
  BREACH_EVENT.overtaken,
]);
/** The Waking's own moments at the gate, heard and told only by its company and those in its hollow. */
const WAKING: ReadonlySet<number> = new Set([BREACH_EVENT.begun, BREACH_EVENT.won, BREACH_EVENT.wiped]);
/** Each bell's note by its place, semitones over the recording: a major scale, so the order is heard as it is seen. */
const NOTES = [0, 2, 4, 5, 7, 9, 11] as const;
/** The Shores' rifts in the hall, by their number. */
const RIFTS = ['rift-was', 'rift-is'] as const;

/** Where a frame's moments are placed: the player (their number and feet), each fighter as drawn, at the gate in the
 *  zone its middle and its moorings by number (none in the run, or before the zone's layout says), and in the run its
 *  hidden chests by number. */
export interface MomentPlaces {
  readonly own: number;
  readonly feet: Point;
  readonly where: (id: number) => Point | null;
  readonly gate: Point | null;
  readonly mooring: (nth: number) => Point | null;
  readonly chest?: (nth: number) => Point | null;
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
 *  the player where they are among them, else at the first; each bell waking at its place's note; a hidden chest the
 *  room pays the player opening where it stands. `picked` says whose own recording has come. */
export function momentSounds(
  plan: BreachPlan,
  seen: BreachSeen,
  had: readonly FightEvent[],
  places: MomentPlaces,
  picked: (cue: string) => boolean = recorded,
): Heard[] {
  const rewritten = had.filter((event) => event.kind === BREACH_EVENT.rewritten);
  const marked = rewritten.find((event) => Math.round(event.amount) === places.own) ?? rewritten[0];
  return had.flatMap((event): Heard[] => {
    if (event.kind === EVENT.chestOpened) {
      const spot = event.striker === places.own ? places.chest?.(chestOf(plan, event)) : null;
      const heard = spot && heardOf({ cue: STATE_CUES.chest, until: null }, spot, picked);
      return heard ? [heard] : [];
    }
    const sound = MOMENT_CUES[event.kind];
    if (!sound || (event.kind === BREACH_EVENT.rewritten && event !== marked)) return [];
    const heard = heardOf(sound, placeOf(plan, seen, event, places), picked);
    if (!heard) return [];
    const note = NOTES[Math.round(event.amount) % NOTES.length] ?? 0;
    return [event.kind === BREACH_EVENT.bellWoke ? { ...heard, rate: 2 ** (note / 12) } : heard];
  });
}

/** The Broken Stair's slabs that rose or sank between the room's ticks `from` and `to`, each heard where it stands
 *  (within the world's sounds' reach); none on the first tick seen (`from` null) or across a gap of more than a
 *  second. */
export function slabSounds(
  plan: BreachPlan,
  from: number | null,
  to: number,
  picked: (cue: string) => boolean = recorded,
): Heard[] {
  // A jump of more than a second (a hidden page's frames stopped) was not seen moving, so it is not heard.
  if (from === null || to <= from || to - from > SLAB_GAP_TICKS) return [];
  return plan.slabs.flatMap(({ at, phase }) => {
    const moved = slabStands(plan, phase, from) !== slabStands(plan, phase, to);
    const heard = moved && at ? heardOf({ cue: STATE_CUES.slab, until: null }, at, picked) : null;
    return heard ? [heard] : [];
  });
}

/** The gate's moorings newly held since the frame before (`before`, none the first frame), each heard at its own. */
export function mooringSounds(
  before: readonly Mooring[] | null,
  now: readonly Mooring[],
  socket: (nth: number) => Point | null,
  picked: (cue: string) => boolean = recorded,
): Heard[] {
  if (!before) return [];
  return now.flatMap((state, nth) => {
    const spot = state === 'held' && before[nth] !== 'held' ? socket(nth) : null;
    const heard = spot && heardOf({ cue: STATE_CUES.mooring, until: null }, spot, picked);
    return heard ? [heard] : [];
  });
}

/** Where a moment is heard: where the one it tells of stands, the place its number names (a bell's, a mooring, a rift,
 *  a Keeper's shore, a desk, the player marked or seen), the gate for the Waking's own, or else at the player's
 *  feet. */
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
      if (event.kind === BREACH_EVENT.shutOut) return [shutOutWords(plan, Math.round(event.amount))];
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
