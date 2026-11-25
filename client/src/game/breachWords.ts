// What a Breach says on the page, from what its room says of it (`BreachSeen`), its plan and what the page counts of
// it (`RunCounts`): its gate's banner in the patrol zone, for everyone there, with the companies inside; the encounter
// under way's banner in its run, with the Lodestone and the revives left; its place line; the call over the view
// while the player must act; and its moments in words. Nothing here judges a rule: the words only say what the room
// said.
import type { Banner } from '../combat/publicBanner.ts';
import { BREACH_EVENT, BREACH_PHASE, type BreachSeen, RIFT, STONE } from '../network/breachMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import type { BreachPlan } from './breachPlan.ts';
import { TICKS_A_SECOND } from './hudLaw.ts';
import { clockWords } from './tasks.ts';

type Point = readonly [number, number, number];

/** The encounters by their place in the Breach's list (crates/room/src/breach/mod.rs). */
export const ENCOUNTER = { waking: 0, mending: 1, choir: 2, ways: 3, shores: 4, steward: 5 } as const;
/** The Mending's seams in the order the room counts them, and the shores, what was then what is, named as their
 *  Keepers are (shores.rs). */
const SEAMS = ['north', 'west', 'east'] as const;
const SHORES = ['What Was', 'What Is'] as const;
/** The room's limits (crates/room/src/breach): the fusions that close the Mending and the Shores, Normal then Hard;
 *  the bells of each of the Choir's rounds, whose `bells` name only those woken yet; the Steward's takings before it
 *  unwrites the company. */
const FUSIONS_MOST = [4, 3] as const;
const ROUND_BELLS = [3, 4, 5, 6, 7] as const;
const TAKINGS_MOST = 4;
/** Why a gate shuts out a member of its company, as the room tells them (judging.rs ShutOut): the company full, or
 *  Hard before a Normal win; any other (under the tier's level, the tier untold) says no more. */
const SHUT_OUT = { full: 1, hard: 3 } as const;
/** Each encounter's line as it begins: the verb that wins it. */
const TEACHING: Readonly<Record<number, string>> = {
  [ENCOUNTER.waking]: 'Hold all three moorings to wake the Spire',
  [ENCOUNTER.mending]: 'Keep the Penitents from the open seams',
  [ENCOUNTER.choir]: 'Break the bells in the order they woke',
  [ENCOUNTER.ways]: 'Reach the Broken Stair unseen, all of you, and walk near a Watcher: it hears a sprint',
  [ENCOUNTER.shores]: 'Fell the Warden, then hold a mooring to open its rift',
  [ENCOUNTER.steward]: 'Ground the Lodestone at its feet, and call the order to the taken',
};
/** Each encounter's line as it is won. */
const WON: Readonly<Record<number, string>> = {
  [ENCOUNTER.mending]: 'The seams are mended',
  [ENCOUNTER.choir]: 'The Scrivener is silenced',
  [ENCOUNTER.ways]: 'Through the Unlit Ways',
  [ENCOUNTER.shores]: 'Both Keepers have fallen',
  [ENCOUNTER.steward]: 'The Steward has fallen',
};

/** Ticks as a clock: "0:12", "1:05"; empty for none. */
export function ticksWords(ticks: number): string {
  return ticks <= 0 ? '' : clockWords(ticks / TICKS_A_SECOND);
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

/** An encounter's line as it begins, the verb that wins it; and as it is won. Empty for none. */
export const teachingWords = (encounter: number): string => TEACHING[encounter] ?? '';
export const wonWords = (encounter: number): string => WON[encounter] ?? '';

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

/** What the page counts of a run itself, beside the room's word (`breachCounts.ts`): the player's number, the ticks
 *  before they are stranded in a shut shore (0 for none), the court's way-back mooring (where it is, how many hold it
 *  and how many it needs), the company living and how many of them stand on the Broken Stair, and the ticks before the
 *  Scrivener's fury (0 in it, null where the page did not see its stage begin). */
export interface RunCounts {
  readonly own: number;
  /** Whether the player stands in one of the Steward's shores. */
  readonly ashore: boolean;
  readonly stranded: number;
  readonly mooring: { readonly at: Point; readonly held: number; readonly needed: number } | null;
  readonly stair: { readonly on: number; readonly living: number } | null;
  readonly fury: number | null;
}
export const NO_COUNTS: RunCounts = { own: -1, ashore: false, stranded: 0, mooring: null, stair: null, fury: null };

/** What the encounter under way shows, in its banner's objective, clock and bar. */
interface Under {
  readonly objective: string;
  readonly clock: number;
  readonly bar: Banner['bar'];
}

const joined = (...parts: readonly string[]) => parts.filter(Boolean).join(' · ');

/** The Choir under way: its rounds, the bells broken of the round's and the font; then the Scrivener, its ward, the
 *  desk it marked, its lone bell's ring, its writing and its fury. */
function choirUnder(seen: BreachSeen, counts: RunCounts): Under {
  if (seen.stage < 2) {
    const font = seen.fontTicks > 0 ? `Font rests ${ticksWords(seen.fontTicks)}` : 'Font lit';
    const ring = seen.ringTicks > 0 ? `Rings in ${ticksWords(seen.ringTicks)}` : '';
    const nth = seen.counts[0] ?? 0;
    const round = `Round ${nth + 1} of ${ROUND_BELLS.length}`;
    const rung = ROUND_BELLS[nth] ?? seen.bells.length;
    const bar = rung > 0 ? { share: seen.broken / rung, label: `Bells broken ${seen.broken} of ${rung}` } : null;
    return { objective: joined(round, ring, font), clock: seen.ringTicks, bar };
  }
  // A desk is blotted by whoever stands on it as its marking ends, so the words ask it held to the end.
  const until = seen.deskTicks > 0 ? ` for ${ticksWords(seen.deskTicks)}` : '';
  const desk = seen.markedDesk >= 0 ? `A desk is marked: hold it${until}` : '';
  const ward = seen.warded ? 'The Scrivener is warded: ground the Lodestone beside it' : 'The Scrivener';
  const bell = seen.ringTicks > 0 ? `A bell rings in ${ticksWords(seen.ringTicks)}` : '';
  const writes = seen.writeTicks > 0 ? `Writes in ${ticksWords(seen.writeTicks)}` : '';
  const fury = counts.fury === null ? '' : counts.fury > 0 ? `Fury in ${ticksWords(counts.fury)}` : 'In its fury';
  return { objective: joined(ward, desk, bell, writes, fury), clock: seen.writeTicks, bar: null };
}

/** The Steward under way, to the taken and to the court: the taken see their shore, the order's call and the bells
 *  broken; the court the takings, the toll, who is taken, the bells and the way back's mooring, and its bareness. */
function stewardUnder(seen: BreachSeen, counts: RunCounts, nameOf: (player: number) => string): Under {
  const away = seen.awayShore >= 0;
  const shore = SHORES[seen.awayShore] ?? '';
  const bells = away && seen.bells.length > 0 ? `Bells broken ${seen.broken} of ${seen.bells.length}` : '';
  const way = away && seen.wayBack ? 'The way back is open' : '';
  const toll = seen.writeTicks > 0 ? `Tolls in ${ticksWords(seen.writeTicks)}` : '';
  // One taken who is back in the court, carried home or stood again there, reads the court's words.
  if (away && seen.away.includes(counts.own) && counts.ashore) {
    const call = way || 'Break the bells in the order the court calls';
    return { objective: joined(`Taken to ${shore}`, call, bells, toll), clock: seen.writeTicks, bar: null };
  }
  // After its last taking, the next one due unwrites the company.
  const due = ticksWords(seen.takingTicks);
  const takes = !due ? '' : seen.takings >= TAKINGS_MOST ? `The company is unwritten in ${due}` : `Takes in ${due}`;
  const taken = away ? `Taken to ${shore}: ${seen.away.map(nameOf).join(', ')}` : '';
  const mooring = away && counts.mooring && counts.mooring.needed > 0 ? counts.mooring : null;
  const held = mooring ? `Mooring of ${shore} held ${mooring.held} of ${mooring.needed}` : '';
  const bare = seen.bareTicks > 0 ? `Laid bare ${ticksWords(seen.bareTicks)}` : '';
  const objective = joined(`Takings ${seen.takings} of ${TAKINGS_MOST}`, takes, toll, taken, bells, way, held, bare);
  return { objective, clock: seen.bareTicks || seen.takingTicks, bar: null };
}

/** The encounter under way, by its number, as its room counts it (crates/room/src/breach/seen.rs) and the page counts
 *  beside it. */
function underWay(seen: BreachSeen, counts: RunCounts, nameOf: (player: number) => string): Under {
  const most = FUSIONS_MOST[seen.tier] ?? FUSIONS_MOST[0];
  switch (seen.encounter) {
    case ENCOUNTER.mending: {
      const open = ['The north seam open', 'The west and east seams open', 'All three seams open', 'The Mender stands'];
      const fusions = seen.counts.reduce((sum, count) => sum + count, 0);
      const seams = seen.counts.map((count, seam) => `${SEAMS[seam] ?? seam} ${count}`).join(' · ');
      const fused = `Fused ${fusions} of ${most}: ${seams}`;
      return { objective: joined(open[seen.stage] ?? '', fused), clock: seen.stageTicks, bar: null };
    }
    case ENCOUNTER.choir:
      return choirUnder(seen, counts);
    case ENCOUNTER.ways: {
      const seenWords = seen.seen
        ? seen.wipeTicks > 0
          ? `Seen: the company is unwritten in ${ticksWords(seen.wipeTicks)}`
          : 'Seen'
        : 'Unseen';
      const stair = counts.stair;
      const onStair = stair ? `On the Broken Stair ${stair.on} of ${stair.living}` : 'Reach the Broken Stair';
      return { objective: joined(seenWords, onStair), clock: seen.wipeTicks, bar: null };
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
      return {
        objective: joined(...rifts, `Keepers fallen ${kept} of 2`, toll, fused),
        clock: seen.writeTicks,
        bar: null,
      };
    }
    case ENCOUNTER.steward:
      return stewardUnder(seen, counts, nameOf);
    default:
      return { objective: '', clock: 0, bar: null };
  }
}

/** The player's own mark in words: Rewritten, with the time before they are unwritten, or the toll or the writing
 *  that unwrites them. Empty while they bear none. */
function markWords(seen: BreachSeen, own: number): string {
  const mark = seen.marked.find((marked) => marked.player === own);
  if (!mark) return '';
  // The Seam and the Steward unwrite at their toll; the Choir and the Scrivener at their writing.
  const tolls = seen.encounter === ENCOUNTER.shores || seen.encounter === ENCOUNTER.steward;
  return mark.ticks > 0
    ? `Rewritten: unwritten in ${ticksWords(mark.ticks)}`
    : `Rewritten: unwritten at the next ${tolls ? 'toll' : 'writing'}`;
}

/** The run's banner: its tier, the encounter under way (or the way on to the next), the Lodestone and the revives
 *  left; the player's own countdown first where one runs (seen in the Ways at Hard, the Lodestone lying, stranded in a
 *  shut shore, Rewritten), its clock and its words, which the call only points to. */
export function runBanner(
  plan: BreachPlan,
  seen: BreachSeen,
  nameOf: (player: number) => string,
  counts: RunCounts = NO_COUNTS,
): Banner {
  const reached = encounterOn(seen);
  const running = seen.encounter > 0;
  const under = underWay(seen, counts, nameOf);
  const cleared = reached >= plan.encounters.length;
  const mark = seen.marked.find((marked) => marked.player === counts.own)?.ticks ?? 0;
  const due = [seen.wipeTicks, seen.lyingTicks, counts.stranded, mark].find((ticks) => ticks > 0) ?? 0;
  const stranded = counts.stranded > 0 ? `Stranded: unwritten in ${ticksWords(counts.stranded)}` : '';
  return {
    tone: cleared ? 'won' : running ? 'running' : 'next',
    kicker: `Breach · ${tierName(plan, seen.tier)}`,
    title: cleared ? `${plan.name} cleared` : encounterName(plan, reached),
    place: plan.name,
    clock: ticksWords(due || under.clock),
    urgent: due > 0,
    objective: running ? under.objective : '',
    bar: under.bar,
    heroic: null,
    bonus: null,
    // The revives are an attempt's: between encounters the next attempt's are whole, so none are counted then.
    elsewhere: joined(
      stranded,
      markWords(seen, counts.own),
      stoneWords(seen, nameOf),
      running ? revivesWords(seen.revives) : '',
    ),
  };
}

/** The place line in a run: its tier, the encounter it is on, and the revives left where they are counted. */
export function runPlaceWords(plan: BreachPlan, seen: BreachSeen | null, tier: number): string {
  const name = tierName(plan, seen?.tier ?? tier);
  if (!seen) return `Breach · ${name}`;
  const reached = encounterName(plan, encounterOn(seen));
  const revives = seen.encounter > 0 ? revivesWords(seen.revives) : '';
  return ['Breach', name, reached, revives].filter(Boolean).join(' · ');
}

/** The call over the view: a few words that stand while the player must act, the countdown beside them in the
 *  banner. Seen in the Ways at Hard; the Lodestone lying; stranded in a shut shore; the player Rewritten (to the font
 *  while it is lit, else to Hold True); a desk marked. Null for none. */
export function breachCall(seen: BreachSeen, counts: Pick<RunCounts, 'own' | 'stranded'>): string | null {
  if (seen.wipeTicks > 0) return 'Seen!';
  if (seen.lyingTicks > 0) return 'Take the stone!';
  if (counts.stranded > 0) return 'Stranded!';
  if (seen.marked.some((marked) => marked.player === counts.own)) {
    // The font cleanses while lit in the Choir's rounds and the Scrivener's stage alike.
    if (seen.encounter === ENCOUNTER.choir && seen.fontTicks === 0) return 'To the font!';
    if (seen.stone === STONE.borne) return seen.bearer === counts.own ? 'Hold True!' : 'To the bearer!';
    // No stone in play and the font resting: nothing saves the mark, and no call sends anyone after one.
    return seen.stone === STONE.away ? null : 'Take the stone!';
  }
  return seen.encounter === ENCOUNTER.choir && seen.markedDesk >= 0 ? 'Onto the desk!' : null;
}

/** Why the room unwrote every living player (lodestone.rs `unwrite_all`), by its word the frame before (`before`)
 *  and as it did: the Lodestone left lying, seen in the Ways at Hard, the seams or the Seam fused to their limit, or
 *  the Steward's last toll. Null for any other unwriting: a writing, or one mark's time come. */
export function unwrittenBy(before: BreachSeen | null, seen: BreachSeen): string | null {
  if (!before) return null;
  const most = FUSIONS_MOST[seen.tier] ?? FUSIONS_MOST[0];
  const fused = seen.counts.reduce((sum, count) => sum + count, 0) >= most;
  // The stone's own unwriting: its count ran out (no more needed, so none counts) while it still lies.
  const ranOut = before.lyingTicks > 0 && before.lyingTicks <= TICKS_A_SECOND && seen.lyingTicks === 0;
  if (ranOut && seen.stone === STONE.lying) return 'the Lodestone lay too long';
  if (before.wipeTicks > 0) return 'seen by a Watcher';
  if (seen.encounter === ENCOUNTER.mending && fused) return `the seams fused ${most} times`;
  if (seen.encounter === ENCOUNTER.shores && fused) return `the Seam fused ${most} times`;
  const last = before.encounter === ENCOUNTER.steward && before.takings >= TAKINGS_MOST;
  return last && before.takingTicks > 0 && before.takingTicks <= TICKS_A_SECOND ? 'the Steward unwrote you' : null;
}

/** Why the gate shut the player out of its company, in words: its company full, or Hard before the Breach is won at
 *  Normal. Under the tier's level it says no more: the room does not tell which tier the player came for. */
export function shutOutWords(plan: BreachPlan, why: number): string {
  if (why === SHUT_OUT.full) return 'The gate shut you out: your company holds eight already.';
  if (why === SHUT_OUT.hard) return `The gate shut you out: Hard opens once ${inSentence(plan.name)} is won at Normal.`;
  return 'The gate shut you out.';
}

/** A moment of the room's in words, to the company (`nameOf` naming each, "you" the player): the company fallen, its
 *  attempt lost, with why where the page knows it (`cause`); the whole company unwritten (`cause` given); one seen by
 *  a Watcher. Null for any other moment (a revive is the game's, told by `footRevive.ts`). */
export function momentWords(
  event: Pick<FightEvent, 'kind' | 'striker' | 'defender' | 'amount'>,
  nameOf: (player: number) => string,
  cause: string | null = null,
): string | null {
  if (event.kind === BREACH_EVENT.wiped) return cause ? `Your company fell: ${cause}.` : 'Your company fell.';
  if (event.kind === BREACH_EVENT.unwritten) return cause ? 'The company is unwritten.' : null;
  return event.kind === BREACH_EVENT.seen ? `A Watcher saw ${nameOf(Math.round(event.amount))}.` : null;
}
