// What the page counts of a Breach's run itself, a frame at a time, where the room's word carries no count: the time
// left to a player in a shore whose rift has shut before they are stranded (shores.rs STRANDED_TICKS), the court's
// mooring of the taken's shore and how many hold it of those it needs (steward.rs), the company on the Broken Stair,
// the Scrivener's fury from the tick its stage began (choir.rs FURY_AFTER), and the hidden chests the room has paid
// the player. Each counts by the room's ticks; the room judges every one.
import { EVENT } from '../combat/cues.ts';
import { type BreachSeen, RIFT } from '../network/breachMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import { holdsMooring } from './breachMarks.ts';
import { type BreachPlan, spaceAt, spaceSocket } from './breachPlan.ts';
import { ENCOUNTER, type RunCounts } from './breachWords.ts';

type Point = readonly [number, number, number];

/** How long a shore left shut strands those in it, and how long the Scrivener writes before its fury, ticks. */
const STRANDED_TICKS = 8 * 60;
const FURY_TICKS = 8 * 60 * 60;
/** How many hold a shore's mooring in the court for its way back, Normal then Hard, while that many are left there. */
const COURT_HOLDS = [1, 2] as const;
const COURT_MOORINGS = ['mooring-was', 'mooring-is'] as const;

/** A frame of the run as the counts read it: the room's word now and the frame before, its events told to the
 *  player, its tick, the player (their number, their feet, and whether they live) and every living player's feet. */
export interface CountedFrame {
  readonly seen: BreachSeen;
  readonly before: BreachSeen | null;
  readonly events: readonly FightEvent[];
  readonly tick: number;
  readonly own: number;
  readonly feet: Point;
  readonly alive: boolean;
  readonly living: () => readonly Point[];
}

/** A hidden chest's place among the Breach's, as the room tells its find (mod.rs `keep_chests`): after the
 *  encounters. */
export const chestOf = (plan: Pick<BreachPlan, 'encounters'>, event: Pick<FightEvent, 'amount'>): number =>
  Math.round(event.amount) - plan.encounters.length;

export class RunCounting {
  private readonly plan: BreachPlan;
  /** The shore the player stands in while its rift is shut, and the tick it was first seen so. */
  private stranded: { readonly rift: number; readonly from: number } | null = null;
  /** The tick the Scrivener's stage was seen to begin; null where it was not. */
  private scrivener: number | null = null;
  /** The hidden chests the room has paid the player, by their place among the Breach's, and the tick it did. */
  private readonly paid = new Map<number, number>();

  constructor(plan: BreachPlan) {
    this.plan = plan;
  }

  /** The counts this frame. */
  frame(frame: CountedFrame): RunCounts {
    const { seen, tick } = frame;
    for (const event of frame.events)
      if (event.kind === EVENT.chestOpened && event.striker === frame.own && !this.paid.has(chestOf(this.plan, event)))
        this.paid.set(chestOf(this.plan, event), tick);
    const living = seen.encounter === ENCOUNTER.ways || seen.awayShore >= 0 ? frame.living() : [];
    const stair =
      seen.encounter === ENCOUNTER.ways ? { on: this.inSpace(living, 'stair'), living: living.length } : null;
    const stewardShores = this.plan.shores['steward'] ?? [];
    return {
      own: frame.own,
      ashore: stewardShores.includes(spaceAt(this.plan, frame.feet[0], frame.feet[1])?.key ?? ''),
      stranded: this.strandedFor(frame),
      mooring: this.mooring(seen, living),
      stair,
      fury: this.fury(frame),
    };
  }

  /** How long ago the room paid the player the hidden chest at `nth` among the Breach's, seconds; null before it
   *  has. */
  chestOpened(nth: number, tick: number): number | null {
    const paid = this.paid.get(nth);
    return paid === undefined ? null : (tick - paid) / 60;
  }

  private inSpace(bodies: readonly Point[], space: string): number {
    return bodies.filter((body) => spaceAt(this.plan, body[0], body[1])?.key === space).length;
  }

  /** The ticks before the player is stranded in the shore they stand in, its rift shut; 0 out of one. */
  private strandedFor({ seen, tick, feet, alive }: CountedFrame): number {
    const shores = this.plan.shores['shores'] ?? [];
    const rift = shores.indexOf(spaceAt(this.plan, feet[0], feet[1])?.key ?? '');
    const shut = alive && seen.encounter === ENCOUNTER.shores && rift >= 0 && seen.rifts[rift] !== RIFT.open;
    if (!shut) {
      this.stranded = null;
      return 0;
    }
    if (this.stranded?.rift !== rift) this.stranded = { rift, from: tick };
    return Math.max(0, STRANDED_TICKS - (tick - this.stranded.from));
  }

  /** The court's mooring of the taken's shore: how many living players hold it, and how many the way back needs, two
   *  at Hard and one at Normal but no more than are left in the court. */
  private mooring(seen: BreachSeen, living: readonly Point[]): RunCounts['mooring'] {
    const spot = seen.awayShore >= 0 ? spaceSocket(this.plan, 'court', COURT_MOORINGS[seen.awayShore] ?? '') : null;
    if (!spot || seen.encounter !== ENCOUNTER.steward) return null;
    const needed = Math.min(COURT_HOLDS[seen.tier] ?? COURT_HOLDS[0], this.inSpace(living, 'court'));
    return { at: spot, held: living.filter((body) => holdsMooring(body, spot)).length, needed };
  }

  /** The ticks before the Scrivener's fury, 0 in it, counted from the frame its stage was seen to begin. */
  private fury({ seen, before, tick }: CountedFrame): number | null {
    const scrivener = seen.encounter === ENCOUNTER.choir && seen.stage === 2;
    if (!scrivener) this.scrivener = null;
    else if (this.scrivener === null && before?.encounter === ENCOUNTER.choir && before.stage < 2)
      this.scrivener = tick;
    return this.scrivener === null ? null : Math.max(0, FURY_TICKS - (tick - this.scrivener));
  }
}
