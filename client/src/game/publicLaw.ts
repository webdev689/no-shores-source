// What the page shows of a zone's public events, worked out from the event the room sends alone: the banner under the
// compass (its name, place, countdown, objective and bar, the heroic task and its window, the bonus, the result), the
// tracker's steps, the compass's marks and the ring at the ground's edge. The words are the page's; the numbers are
// the room's (crates/room/src/public).
import { STORE } from '../city/eventProps.ts';
import { HEROIC, MARK, PUBLIC_KIND, PUBLIC_PHASE, type PublicEvent } from '../network/publicMessages.ts';
import type { Banner } from '../combat/publicBanner.ts';
import type { PlaceMark } from '../plus/compass.ts';
import type { Quest, Step } from './tasks.ts';

/** The zones that hold public events, in their places on the clock (the Saltgrass Downs alone, for now), each running
 *  one every `PERIOD_MINUTES`, the Fissure and the raid in turn, a zone added `ZONE_APART_MINUTES` after the one
 *  before it (crates/room/src/public/mod.rs ZONES and schedule). */
const ZONES = ['saltgrass-downs'] as const;
const PERIOD_MINUTES = 15;
const ZONE_APART_MINUTES = 5;
/** The room's ticks a second; how long an event runs and a chest lies, its ticks (crates/room/src/public/mod.rs
 *  COUNTDOWN_MINUTES, crates/room/src/drops.rs); the last minute's, in which the clock is urgent. */
const TICKS_PER_SECOND = 60;
const COUNTDOWN_TICKS = 8 * 60 * TICKS_PER_SECOND;
export const CHEST_LIES_S = 120;
const LAST_MINUTE_TICKS = 60 * TICKS_PER_SECOND;

/** Each event's name, and where each zone fights it: its wilds for the Fissure, its hamlet for the raid. */
const NAMES: Readonly<Record<number, string>> = {
  [PUBLIC_KIND.fissure]: 'The Fissure',
  [PUBLIC_KIND.raid]: 'The Grey Tithe Raid',
};
const PLACES: Readonly<Record<string, readonly [string, string]>> = {
  'saltgrass-downs': ['The High Downs', 'Saltgrass'],
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
  const seconds = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const placeOf = (zone: string, kind: number): string => PLACES[zone]?.[kind === PUBLIC_KIND.raid ? 1 : 0] ?? '';
/** The place, and how far off it is from `from` (metres) where that is outside the ring of `radius` round `at`. */
const placeFrom = (
  place: string,
  ground: readonly number[],
  radius: number,
  from: readonly [number, number] | null,
) => {
  const metres = from ? Math.hypot((ground[0] ?? 0) - from[0], (ground[1] ?? 0) - from[1]) : 0;
  return from && metres > radius ? `${place} · ${Math.round(metres)} m` : place;
};
const over = (event: PublicEvent) => event.phase === PUBLIC_PHASE.won || event.phase === PUBLIC_PHASE.failed;
const running = (event: PublicEvent) => event.kind !== PUBLIC_KIND.none && event.phase === PUBLIC_PHASE.running;

/** What the player is to do now: carry shards, or kill the Warden; hold the stores through the wave, or break Marrow. */
function objectiveOf(event: PublicEvent): string {
  if (event.kind === PUBLIC_KIND.fissure)
    return event.stage >= 2 ? 'Kill the Warden of the Fissure' : 'Carry shards to the fissure to seal it';
  const marrow = event.heroic === HEROIC.met && event.stages === 4 && event.stage === 4;
  return marrow
    ? 'Break Reeve Ancel Marrow, the Tithe’s Hand'
    : `Hold the stores: wave ${event.stage} of ${event.stages}`;
}

/** What a won event says: to a player it left a chest, that chest as the room tiers it (crates/room/src/public/chest.rs:
 *  heroic, and the bonus); to one who took no part, only that it was won. */
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

/** The banner for the zone's event `event` in `zone`: the one running or showing its result (its chest's words only
 *  where the player `hasChest`), else the next one's line, counted to the second in its last minute; where the player
 *  stands `from` outside its ground, how far off it is. Null where none is known. */
export function bannerOf(
  event: PublicEvent | null,
  zone: string,
  hasChest = false,
  from: readonly [number, number] | null = null,
): Banner | null {
  if (!event) return null;
  if (event.kind === PUBLIC_KIND.none || event.phase === PUBLIC_PHASE.waiting) {
    if (event.nextKind === PUBLIC_KIND.none) return null;
    const minutes = Math.max(1, Math.ceil(event.nextTicks / (TICKS_PER_SECOND * 60)));
    return {
      tone: 'next',
      kicker: 'Next public event',
      title: NAMES[event.nextKind] ?? '',
      place: placeFrom(placeOf(zone, event.nextKind), event.nextGround, event.radius, from),
      clock: event.nextTicks <= LAST_MINUTE_TICKS ? clockOf(event.nextTicks) : `in ${minutes} min`,
      objective: '',
      bar: null,
      heroic: null,
      bonus: null,
    };
  }
  const title = NAMES[event.kind] ?? '';
  const place = placeFrom(placeOf(zone, event.kind), event.ground, event.radius, over(event) ? null : from);
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

/** The line naming what runs, or else what comes next, in the island's other zones that hold events, from the room's
 *  schedule read on from when `event`'s own next starts ("Elsewhere on Saltmere: the Grey Tithe Raid at Saltgrass in
 *  3 min"); none while the zone is the island's only one. */
export function elsewhereOf(event: PublicEvent, zone: string): string {
  const place = ZONES.indexOf(zone as (typeof ZONES)[number]);
  if (place < 0 || event.nextKind === PUBLIC_KIND.none) return '';
  // The schedule repeats every two periods; a slot's event is the Fissure where its number and the zone's are even.
  const cycle = 2 * PERIOD_MINUTES;
  const parity = event.nextKind === PUBLIC_KIND.fissure ? 0 : 1;
  const slot = (place + parity) % 2;
  const now = place * ZONE_APART_MINUTES + slot * PERIOD_MINUTES - event.nextTicks / (TICKS_PER_SECOND * 60);
  const countdown = COUNTDOWN_TICKS / (TICKS_PER_SECOND * 60);
  const starts = ZONES.flatMap((other, its) =>
    its === place
      ? []
      : [0, 1].map((each) => {
          const kind = (each + its) % 2 === 0 ? PUBLIC_KIND.fissure : PUBLIC_KIND.raid;
          const away = (((its * ZONE_APART_MINUTES + each * PERIOD_MINUTES - now) % cycle) + cycle) % cycle;
          // Started `since` minutes ago: one starting this very minute is under way, not a cycle off.
          const since = (cycle - away) % cycle;
          return { kind, where: placeOf(other, kind).replace(/^The /, 'the '), away, left: countdown - since };
        }),
  );
  const named = (kind: number) => `the ${(NAMES[kind] ?? '').replace(/^The /, '')}`;
  const running = starts.filter((each) => each.left > 0).sort((one, other) => other.left - one.left)[0];
  if (running) return `Elsewhere on Saltmere: ${named(running.kind)} at ${running.where}, under way`;
  const next = [...starts].sort((one, other) => one.away - other.away)[0];
  return next
    ? `Elsewhere on Saltmere: ${named(next.kind)} at ${next.where} in ${Math.max(1, Math.ceil(next.away))} min`
    : '';
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
