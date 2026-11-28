// What the page shows of a zone's public events, worked out from the event the room sends alone: the banner under the
// compass (its name, place, countdown, objective and bar, the heroic task and its window, the bonus, the result), the
// tracker's steps, the compass's marks and the ring at the ground's edge. The words are the page's; the numbers are
// the room's (crates/room/src/public).
import { STORE } from '../city/eventProps.ts';
import { HEROIC, MARK, PUBLIC_KIND, PUBLIC_PHASE, type PublicEvent } from '../network/publicMessages.ts';
import type { Banner } from '../combat/publicBanner.ts';
import type { PlaceMark } from '../plus/compass.ts';
import { TICKS_A_SECOND } from './hudLaw.ts';
import { clockWords, type Quest, type Step } from './tasks.ts';

/** The zones that hold public events, in their places on the clock, each running one every `PERIOD_MINUTES`, the
 *  zones `ZONE_APART_MINUTES` apart (crates/room/src/public/mod.rs ZONES and schedule). */
const ZONES = ['saltgrass-downs', 'gullwing-vale', 'driftwood-moors'] as const;
const PERIOD_MINUTES = 15;
const ZONE_APART_MINUTES = 5;
/** How long an event runs and a chest lies, its ticks (crates/room/src/public/mod.rs COUNTDOWN_MINUTES,
 *  crates/room/src/drops.rs); the last minute's, in which the clock is urgent. */
const COUNTDOWN_TICKS = 8 * 60 * TICKS_A_SECOND;
export const CHEST_LIES_S = 120;
const LAST_MINUTE_TICKS = 60 * TICKS_A_SECOND;

/** Each event's name, and where each zone fights it: its wilds for the Fissure, its hamlet for the raid. */
const NAMES: Readonly<Record<number, string>> = {
  [PUBLIC_KIND.fissure]: 'The Fissure',
  [PUBLIC_KIND.raid]: 'The Grey Tithe Raid',
};
const PLACES: Readonly<Record<string, readonly [string, string]>> = {
  'saltgrass-downs': ['The High Downs', 'Saltgrass'],
  'gullwing-vale': ['The Water Meadows', 'Gullwing'],
  'driftwood-moors': ['The Gorse Moor', 'Moorend'],
};
/** The heroic task while its window is open, and the bonus objective, by event. */
const HEROIC_TASK: Readonly<Record<number, string>> = {
  [PUBLIC_KIND.fissure]: 'Break the growth',
  [PUBLIC_KIND.raid]: 'Kill the tithe-taker',
};
/** The bonus, in the banner and the tracker alike, its deadline on the countdown where it has one. */
const BONUS: Readonly<Record<number, string>> = {
  [PUBLIC_KIND.fissure]: `Bonus: seal it before ${clockOf(COUNTDOWN_TICKS / 2)}`,
  [PUBLIC_KIND.raid]: 'Bonus: lose no store',
};

/** `ticks` as minutes and seconds, the seconds rounded up: 7:42. */
export function clockOf(ticks: number): string {
  return clockWords(ticks / TICKS_A_SECOND);
}

const placeOf = (zone: string, kind: number): string => PLACES[zone]?.[kind === PUBLIC_KIND.raid ? 1 : 0] ?? '';
const over = (event: PublicEvent) => event.phase === PUBLIC_PHASE.won || event.phase === PUBLIC_PHASE.failed;
const running = (event: PublicEvent) => event.kind !== PUBLIC_KIND.none && event.phase === PUBLIC_PHASE.running;

/** Whether `feet` stand in the zone's event, running or showing its result: on its ground, inside its ring. Its
 *  panel and steps show only there; elsewhere the held map marks it (`mapEventOf`). */
export function inEvent(event: PublicEvent | null, feet: readonly number[]): boolean {
  if (!event || !(running(event) || (event.kind !== PUBLIC_KIND.none && over(event)))) return false;
  return Math.hypot(event.ground[0] - (feet[0] ?? 0), event.ground[1] - (feet[1] ?? 0)) <= event.radius;
}

/** The zone's event as the held map marks it while it runs: its ground, its name and the time it has left. */
export function mapEventOf(
  event: PublicEvent | null,
): { at: readonly [number, number]; name: string; clock: string } | null {
  if (!event || !running(event)) return null;
  return { at: [event.ground[0], event.ground[1]], name: NAMES[event.kind] ?? '', clock: clockOf(event.ticksLeft) };
}

/** What the player is to do now: carry shards, or kill the Warden; hold the stores through the wave, or break
 *  Marrow. */
function objectiveOf(event: PublicEvent): string {
  if (event.kind === PUBLIC_KIND.fissure)
    return event.stage >= 2 ? 'Kill the Warden of the Fissure' : 'Carry shards to the fissure to seal it';
  const marrow = event.heroic === HEROIC.met && event.stages === 4 && event.stage === 4;
  return marrow
    ? 'Break Reeve Ancel Marrow, the Tithe’s Hand'
    : `Hold the stores: wave ${event.stage} of ${event.stages}`;
}

/** What a won event says: to a player it left a chest, that chest as the room tiers it
 *  (crates/room/src/public/chest.rs: heroic, and the bonus); to one who took no part, only that it was won. */
function chestWords(event: PublicEvent, hasChest: boolean): string {
  if (!hasChest) return event.kind === PUBLIC_KIND.raid ? 'The Tithe gave up' : 'The fissure is sealed';
  const heroic = event.heroic === HEROIC.met;
  const parts = [heroic ? 'heroic' : '', event.bonus ? (heroic ? 'with the bonus' : 'the bonus met') : ''];
  const said = parts.filter(Boolean).join(', ');
  return said ? `Your chest waits at the ground: ${said}` : 'Your chest waits at the ground';
}

/** Why an event failed: its countdown ran out, or (the raid) every store fell. */
function failedWords(event: PublicEvent): string {
  if (event.kind === PUBLIC_KIND.raid)
    return event.progress <= 0 ? 'Every store fell' : 'Time ran out: the Tithe marched out';
  return 'Time ran out: the Lattice sank back into the earth';
}

/** The banner for the zone's event `event` in `zone`, running or showing its result (its chest's words only where
 *  the player `hasChest`), shown on its ground (`inEvent`). Null between events. */
export function bannerOf(event: PublicEvent | null, zone: string, hasChest = false): Banner | null {
  if (!event || event.kind === PUBLIC_KIND.none || event.phase === PUBLIC_PHASE.waiting) return null;
  const title = NAMES[event.kind] ?? '';
  const place = placeOf(zone, event.kind);
  const heroicMet = event.heroic === HEROIC.met;
  if (over(event)) {
    const won = event.phase === PUBLIC_PHASE.won;
    return {
      tone: won ? 'won' : 'failed',
      kicker: won ? 'Event complete' : 'Event failed',
      title,
      place,
      clock: '',
      objective: won ? chestWords(event, hasChest) : failedWords(event),
      bar: null,
      heroic: won && heroicMet ? { text: 'Heroic', clock: '', met: true } : null,
      bonus: won ? { text: BONUS[event.kind] ?? '', state: event.bonus ? 'met' : 'lost' } : null,
    };
  }
  const fissure = event.kind === PUBLIC_KIND.fissure;
  const share = fissure ? event.progress / Math.max(1, event.needed) : event.progress / 1000;
  const label = fissure ? `${event.progress} / ${event.needed} shards` : `Stores ${Math.floor(event.progress / 10)}%`;
  const heroic =
    event.heroic === HEROIC.offered
      ? { text: HEROIC_TASK[event.kind] ?? '', clock: clockOf(event.heroicTicks), met: false }
      : heroicMet
        ? { text: 'Heroic', clock: '', met: true }
        : null;
  return {
    tone: heroicMet ? 'heroic' : 'running',
    kicker: heroicMet ? 'Heroic public event' : 'Public event',
    title,
    place,
    clock: clockOf(event.ticksLeft),
    urgent: event.ticksLeft <= LAST_MINUTE_TICKS,
    objective:
      event.kind === PUBLIC_KIND.raid && event.nextWaveTicks > 0
        ? `${objectiveOf(event)} · Next wave ${clockOf(event.nextWaveTicks)}`
        : objectiveOf(event),
    // The Warden's stage has no shards left to set: the bar is full.
    bar: { share: Math.min(1, Math.max(0, share)), label },
    heroic,
    bonus: { text: BONUS[event.kind] ?? '', state: event.bonus ? 'holds' : 'lost' },
  };
}

/** The tracker's step for a chest of a `kind` event in `zone` still lying for the player, `left` seconds more. */
export function chestQuestOf(left: number, zone: string, kind: number): Quest {
  return {
    name: NAMES[kind] ?? 'Public event',
    task: placeOf(zone, kind),
    steps: [{ text: 'Open your chest', clock: Math.max(0, left) }],
  };
}

/** The tracker's quest while an event runs: its name, its objective, and its steps, each counting what is left. */
export function questOf(event: PublicEvent | null, zone: string): Quest | null {
  if (!event || !running(event)) return null;
  const fissure = event.kind === PUBLIC_KIND.fissure;
  const steps: Step[] = [];
  if (fissure && event.stage < 2)
    steps.push({ text: 'Carry shards to the fissure', count: Math.max(0, event.needed - event.progress) });
  else if (fissure) steps.push({ text: 'Kill the Warden of the Fissure' });
  else {
    steps.push({ text: objectiveOf(event).replace('Hold the stores: wave', 'Break wave') });
    const standing = event.marks.filter((mark) => mark.kind === MARK.store && mark.state === STORE.whole).length;
    steps.push({ text: 'Keep a store standing', count: standing });
  }
  const task = (HEROIC_TASK[event.kind] ?? '').toLowerCase();
  if (event.heroic === HEROIC.offered) steps.push({ text: `Heroic: ${task}` });
  else if (event.heroic === HEROIC.met) steps.push({ text: `Heroic: ${task}`, done: true });
  if (event.bonus) steps.push({ text: BONUS[event.kind] ?? '' });
  return { name: NAMES[event.kind] ?? '', task: placeOf(zone, event.kind), steps };
}

/** What the compass marks of the zone's events: the ground of the one running or showing its result, else the next
 *  one's; and while the heroic window is open, the growth or the tithe-taker. */
export function compassOf(event: PublicEvent | null): PlaceMark[] {
  if (!event) return [];
  const now = event.kind !== PUBLIC_KIND.none && event.phase !== PUBLIC_PHASE.waiting;
  if (!now && event.nextKind === PUBLIC_KIND.none) return [];
  const [x, y] = now ? event.ground : event.nextGround;
  const places: PlaceMark[] = [{ x, y, kind: 'event' }];
  if (running(event) && event.heroic === HEROIC.offered)
    for (const mark of event.marks)
      if (mark.kind === MARK.growth || mark.kind === MARK.titheTaker)
        places.push({ x: mark.at[0], y: mark.at[1], kind: 'heroic' });
  return places;
}

/** The ring on the ground at the running event's edge: its middle and radius; none between events. */
export function ringOf(event: PublicEvent | null): { at: readonly [number, number, number]; radius: number } | null {
  return event && running(event) ? { at: event.ground, radius: event.radius } : null;
}

/** The event the dev address asks to start at once (`&public=fissure` or `&public=raid`), if any. */
export function askedPublic(search: string): 'fissure' | 'raid' | null {
  const asked = new URLSearchParams(search).get('public');
  return asked === 'fissure' || asked === 'raid' ? asked : null;
}

/** The Unix minute the dev address asks a room played alone to stand its clock at (`&minute=`), if any, so a picture
 *  holds the world's hour and its public events where it wants them. */
export function askedMinute(search: string): number | null {
  const asked = Number(new URLSearchParams(search).get('minute') ?? Number.NaN);
  return Number.isInteger(asked) && asked > 0 ? asked : null;
}

/** How many minutes on from `minute` the room's clock is set for `zone`'s next `kind` to start at once: the
 *  room's own schedule (crates/room/src/public/mod.rs), read the other way. Null for a zone that holds none. */
export function minuteShift(zone: string, kind: 'fissure' | 'raid', minute: number): number | null {
  const place = ZONES.indexOf(zone as (typeof ZONES)[number]);
  if (place < 0) return null;
  const offset = place * ZONE_APART_MINUTES;
  const wanted = kind === 'fissure' ? 0 : 1;
  let slot = Math.max(0, Math.ceil((minute - offset) / PERIOD_MINUTES));
  if ((slot + place) % 2 !== wanted) slot += 1;
  return offset + slot * PERIOD_MINUTES - minute;
}
