// What a Breach says on the page, from what its room says of it (`BreachSeen`) and its plan: its gate's banner in the
// patrol zone, for everyone there, with the companies inside; the encounter under way's banner in its run, with the
// Lodestone and the revives left; its place line; and the call over the view while a mark or a countdown is the
// player's. Nothing here judges a rule: the words only say what the room said.
import type { Banner } from '../combat/publicBanner.ts';
import { BREACH_EVENT, BREACH_PHASE, type BreachSeen, RIFT, STONE } from '../network/breachMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { BreachPlan } from './breachPlan.ts';

/** The room's ticks a second. */
const TICKS_PER_SECOND = 60;
/** The encounters by their place in the Breach's list (crates/room/src/breach/mod.rs). */
export const ENCOUNTER = { waking: 0, mending: 1, choir: 2, ways: 3, shores: 4, steward: 5 } as const;
/** The Mending's seams and the Shores' rifts, in the order the room counts them. */
const SEAMS = ['north', 'west', 'east'] as const;
const SHORES = ['what was', 'what is'] as const;
/** The room's limits (crates/room/src/breach): the fusions that close the Mending and the Shores, Normal then Hard;
 *  the bells of each of the Choir's rounds, whose `bells` name only those woken yet; the Steward's takings before it
 *  unwrites the company. */
const FUSIONS_MOST = [4, 3] as const;
const ROUND_BELLS = [3, 4, 5, 6, 7] as const;
const TAKINGS_MOST = 4;

/** Ticks as a clock: "0:12", "1:05"; empty for none. */
export function ticksWords(ticks: number): string {
  if (ticks <= 0) return '';
  const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;
const tierName = (plan: BreachPlan, tier: number) => plan.tiers[tier]?.name ?? '';

/** The revives left in words: "1 revive left", "No revives left"; empty where none are counted (-1). */
export function revivesWords(revives: number): string {
  if (revives < 0) return '';
  return revives === 0 ? 'No revives left' : `${revives} revive${revives === 1 ? '' : 's'} left`;
}

/** A name as a sentence carries it after a verb: "Enter the Drowned Vale". */
export const inSentence = (name: string): string => name.replace(/^The /, 'the ');

/** An encounter's name by its number; empty for none. */
export const encounterName = (plan: BreachPlan, encounter: number): string => plan.encounters[encounter]?.name ?? '';

/** The encounter a run is on: the one under way, else the first not yet won. */
export function encounterOn(seen: BreachSeen): number {
  if (seen.encounter > 0) return seen.encounter;
  const next = seen.phases.findIndex((phase) => phase !== BREACH_PHASE.won);
  return next < 0 ? seen.phases.length : next;
}

/** The companies inside the run, as the gate shows the zone: "Ada · Hard · The Choir". */
export function insideWords(plan: BreachPlan, seen: BreachSeen): string[] {
  return seen.inside.map((company) => {
    const reached = encounterName(plan, company.encounter) || 'Cleared';
    return [company.name, tierName(plan, company.tier), reached].filter(Boolean).join(' · ');
  });
}

/** Which of the gate's three moorings each stands as: claimed by the Lattice, held by a player, or free. */
export type Mooring = 'claimed' | 'held' | 'free';

/** The gate's banner for everyone in the zone (`gate` true): the Waking while a company holds it (named `holding`, as
 *  the inside list names companies), with its tier, its moorings and the revives it has left, and the Spire's fill;
 *  the gate open to the player's company; and the companies inside. */
export function gateBanner(
  plan: BreachPlan,
  seen: BreachSeen,
  place: string,
  moorings: readonly Mooring[],
  mine: boolean,
  holding = '',
): Banner {
  const tier = tierName(plan, seen.tier);
  const held = moorings.filter((mooring) => mooring === 'held').length;
  const claimed = moorings.filter((mooring) => mooring === 'claimed').length;
  const stones = `Moorings held ${held} of ${moorings.length}${claimed > 0 ? ` · ${claimed} claimed` : ''}`;
  const waking = ['The Waking', holding, tier, stones, revivesWords(seen.revives)].filter(Boolean).join(' · ');
  const objective = mine
    ? `The gate is open to your company: enter at the gate`
    : seen.woken
      ? 'The Spire woke: the gate is open to its company'
      : seen.heldBy
        ? waking
        : 'No company holds the gate';
  const inside = insideWords(plan, seen);
  return {
    tone: mine || seen.woken ? 'won' : seen.heldBy ? 'running' : 'next',
    kicker: 'Breach',
    title: plan.name,
    place,
    clock: '',
    objective,
    bar: seen.heldBy && !seen.woken ? { share: seen.fill, label: `Spire ${percent(seen.fill)}` } : null,
    heroic: null,
    bonus: null,
    elsewhere: inside.length > 0 ? `Inside: ${inside.join('; ')}` : '',
  };
}

/** The gate in one line, for the zone's banner while another stands there: "The Drowned Vale: the Waking, Spire 40%
 *  · Inside: Ada · Hard · The Choir". Empty while nothing stirs. */
export function gateLine(plan: BreachPlan, seen: BreachSeen): string {
  const waking = seen.woken ? 'the gate open' : seen.heldBy ? `the Waking, Spire ${percent(seen.fill)}` : '';
  const inside = insideWords(plan, seen);
  const parts = [waking, inside.length > 0 ? `Inside: ${inside.join('; ')}` : ''].filter(Boolean);
  return parts.length > 0 ? `${plan.name}: ${parts.join(' · ')}` : '';
}

/** The Lodestone in words, `nameOf` naming its bearer: on its plinth, borne with its charge and Hold True, or lying
 *  with the time before the company is unwritten. Empty while it is away. */
export function stoneWords(seen: BreachSeen, nameOf: (player: number) => string): string {
  if (seen.stone === STONE.plinth) return 'Lodestone on its plinth';
  if (seen.stone === STONE.borne) {
    const hold = seen.held > 0 ? ` · Hold True ${percent(seen.held)}` : '';
    return `Lodestone borne by ${nameOf(seen.bearer)} · charge ${percent(seen.charge)}${hold}`;
  }
  if (seen.stone === STONE.lying)
    return seen.lyingTicks > 0 ? `Lodestone lying · unwritten in ${ticksWords(seen.lyingTicks)}` : 'Lodestone lying';
  return '';
}

/** What the encounter under way shows, in its banner's objective, clock and bar. */
interface Under {
  readonly objective: string;
  readonly clock: number;
  readonly bar: Banner['bar'];
}

/** The encounter under way, by its number, as its room counts it (crates/room/src/breach/seen.rs). */
function underWay(seen: BreachSeen, nameOf: (player: number) => string): Under {
  const most = FUSIONS_MOST[seen.tier] ?? FUSIONS_MOST[0];
  const bells = (seen.bells.length > 0 && `Bells broken ${seen.broken} of ${seen.bells.length}`) || '';
  switch (seen.encounter) {
    case ENCOUNTER.mending: {
      const open = ['The north seam open', 'The west and east seams open', 'All three seams open', 'The Mender stands'];
      const fusions = seen.counts.reduce((sum, count) => sum + count, 0);
      const seams = seen.counts.map((count, seam) => `${SEAMS[seam] ?? seam} ${count}`).join(' · ');
      const fused = `Fused ${fusions} of ${most}: ${seams}`;
      return { objective: [open[seen.stage] ?? '', fused].join(' · '), clock: seen.stageTicks, bar: null };
    }
    case ENCOUNTER.choir: {
      if (seen.stage < 2) {
        const font = seen.fontTicks > 0 ? `Font rests ${ticksWords(seen.fontTicks)}` : 'Font lit';
        const ring = seen.ringTicks > 0 ? `Rings in ${ticksWords(seen.ringTicks)}` : '';
        const nth = seen.counts[0] ?? 0;
        const round = `Round ${nth + 1} of ${ROUND_BELLS.length}`;
        const rung = ROUND_BELLS[nth] ?? seen.bells.length;
        const bar = rung > 0 ? { share: seen.broken / rung, label: `Bells broken ${seen.broken} of ${rung}` } : null;
        return { objective: [round, ring, font].filter(Boolean).join(' · '), clock: seen.ringTicks, bar };
      }
      const desk =
        seen.markedDesk >= 0
          ? `Desk ${seen.markedDesk + 1} marked: blot it from its step · ${ticksWords(seen.deskTicks)}`
          : '';
      const ward = seen.warded ? 'The Scrivener is warded: ground the Lodestone beside it' : 'The Scrivener';
      const writes = seen.writeTicks > 0 ? `Writes in ${ticksWords(seen.writeTicks)}` : '';
      return { objective: [ward, desk, writes].filter(Boolean).join(' · '), clock: seen.writeTicks, bar: null };
    }
    case ENCOUNTER.ways: {
      const seenWords = seen.seen
        ? seen.wipeTicks > 0
          ? `Seen: the company is unwritten in ${ticksWords(seen.wipeTicks)}`
          : 'Seen'
        : 'Unseen';
      return { objective: `${seenWords} · reach the Broken Stair`, clock: seen.wipeTicks, bar: null };
    }
    case ENCOUNTER.shores: {
      if (seen.stage === 0) return { objective: 'The Warden stands at the Seam', clock: 0, bar: null };
      const rifts = seen.rifts.map((rift, index) => {
        const state =
          rift === RIFT.open
            ? 'open'
            : rift === RIFT.opening
              ? `opening ${percent(seen.riftHeld[index] ?? 0)}`
              : 'shut';
        return `Rift of ${SHORES[index] ?? index} ${state}`;
      });
      const kept = [0, 1].filter((rift) => (seen.kept & (1 << rift)) !== 0).length;
      const toll = seen.writeTicks > 0 ? `Tolls in ${ticksWords(seen.writeTicks)}` : '';
      const fused = `Fused ${seen.counts[0] ?? 0} of ${most}`;
      const objective = [...rifts, `Keepers fallen ${kept} of 2`, toll, fused].filter(Boolean).join(' · ');
      return { objective, clock: seen.writeTicks, bar: null };
    }
    case ENCOUNTER.steward: {
      const away =
        seen.awayShore >= 0
          ? `Taken to ${SHORES[seen.awayShore] ?? seen.awayShore}: ${seen.away.map(nameOf).join(', ')}${seen.wayBack ? ' · the way back is open' : ''}`
          : '';
      const bare = seen.bareTicks > 0 ? `Laid bare ${ticksWords(seen.bareTicks)}` : '';
      // After its last taking, the next one due unwrites the company.
      const last = seen.takings >= TAKINGS_MOST;
      const due = ticksWords(seen.takingTicks);
      const takes = !due ? '' : last ? `The company is unwritten in ${due}` : `Takes in ${due}`;
      const toll = seen.writeTicks > 0 ? `Tolls in ${ticksWords(seen.writeTicks)}` : '';
      const takings = `Takings ${seen.takings} of ${TAKINGS_MOST}`;
      const objective = [takings, takes, toll, away, seen.awayShore >= 0 ? bells : '', bare]
        .filter(Boolean)
        .join(' · ');
      return { objective, clock: seen.bareTicks || seen.takingTicks, bar: null };
    }
    default:
      return { objective: '', clock: 0, bar: null };
  }
}

/** The run's banner: its tier, the encounter under way (or the way on to the next), the Lodestone and the revives
 *  left. */
export function runBanner(plan: BreachPlan, seen: BreachSeen, nameOf: (player: number) => string): Banner {
  const reached = encounterOn(seen);
  const running = seen.encounter > 0;
  const under = underWay(seen, nameOf);
  const revives = revivesWords(seen.revives);
  const cleared = reached >= plan.encounters.length;
  return {
    tone: cleared ? 'won' : running ? 'running' : 'next',
    kicker: `Breach · ${tierName(plan, seen.tier)}`,
    title: cleared ? `${plan.name} cleared` : encounterName(plan, reached),
    place: plan.name,
    clock: ticksWords(under.clock),
    urgent: seen.wipeTicks > 0 || seen.lyingTicks > 0,
    objective: running ? under.objective : '',
    bar: under.bar,
    heroic: null,
    bonus: null,
    elsewhere: [stoneWords(seen, nameOf), revives].filter(Boolean).join(' · '),
  };
}

/** The place line in a run: its tier, the encounter it is on, and the revives left where they are counted. */
export function runPlaceWords(plan: BreachPlan, seen: BreachSeen | null, tier: number): string {
  const name = tierName(plan, seen?.tier ?? tier);
  if (!seen) return `Breach · ${name}`;
  const reached = encounterName(plan, encounterOn(seen));
  return ['Breach', name, reached, revivesWords(seen.revives)].filter(Boolean).join(' · ');
}

/** The call over the view for the player numbered `own`: Rewritten with the time before they are unwritten, or the
 *  company's countdown while it runs (seen in the Ways at Hard, the Lodestone lying). Null for none. */
export function breachCall(seen: BreachSeen, own: number): string | null {
  if (seen.wipeTicks > 0) return `Seen: the company is unwritten in ${ticksWords(seen.wipeTicks)}`;
  if (seen.lyingTicks > 0) return `The Lodestone lies: the company is unwritten in ${ticksWords(seen.lyingTicks)}`;
  const mark = seen.marked.find((marked) => marked.player === own);
  if (!mark) return null;
  // The Seam and the Steward unwrite at their toll; the Choir and the Scrivener at their writing.
  const tolls = seen.encounter === ENCOUNTER.shores || seen.encounter === ENCOUNTER.steward;
  return mark.ticks > 0
    ? `Rewritten: unwritten in ${ticksWords(mark.ticks)}`
    : `Rewritten: unwritten at the next ${tolls ? 'toll' : 'writing'}`;
}

/** A moment of the room's in words, for a company of `company` players (`nameOf` naming each, "you" the player): the
 *  company fallen, its attempt lost; a fallen one raised, with the revives left where they are counted; the whole
 *  company unwritten. Null for any other moment. */
export function momentWords(
  event: Pick<FightEvent, 'kind' | 'striker' | 'defender' | 'amount'>,
  company: number,
  nameOf: (player: number) => string,
): string | null {
  if (event.kind === BREACH_EVENT.wiped) return 'Your company fell.';
  if (event.kind === BREACH_EVENT.unwritten) return event.amount >= company ? 'The company is unwritten.' : null;
  if (event.kind !== BREACH_EVENT.revived) return null;
  // The room tells a raising's revives left, or 255 where none are counted.
  const left = event.amount < 255 ? revivesWords(event.amount) : '';
  const raised = `${nameOf(event.striker)} raised ${nameOf(event.defender)}`;
  return [`${raised[0]?.toUpperCase() ?? ''}${raised.slice(1)}`, left].filter(Boolean).join(' · ');
}
