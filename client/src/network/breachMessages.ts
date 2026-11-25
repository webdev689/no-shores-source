import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';

/** The Lodestone's states (crates/room/src/breach/seen.rs `stone`), and an encounter's phases. */
export const STONE = { away: 0, plinth: 1, borne: 2, lying: 3 } as const;
export const BREACH_PHASE = { waiting: 0, running: 1, won: 2 } as const;
/** A rift's states: shut, opening while held, open. */
export const RIFT = { shut: 0, opening: 1, open: 2 } as const;
/** A Breach's moments by their numbers (crates/room/src/judging.rs EventKind), each told to every player in its room
 *  but the gate shutting a member of its company out (`shutOut`), told to them alone; what each event's amount carries
 *  is said there. */
export const BREACH_EVENT = {
  begun: 38,
  stage: 39,
  won: 40,
  wiped: 41,
  cleared: 42,
  rewritten: 43,
  cleansed: 44,
  carried: 45,
  unwritten: 46,
  lodestoneTaken: 47,
  lodestoneDropped: 48,
  grounded: 49,
  heldTrue: 50,
  bellWoke: 51,
  bellBroken: 52,
  bellRang: 53,
  fused: 54,
  overtaken: 55,
  claimed: 56,
  deskMarked: 57,
  blotted: 58,
  wroteItself: 59,
  seen: 60,
  riftOpened: 61,
  riftClosed: 62,
  keeperFell: 63,
  tolled: 64,
  taken: 65,
  wayBack: 66,
  returned: 67,
  laidBare: 68,
  shutOut: 69,
} as const;

/** A company inside a Breach's run, as its gate shows the zone: its leader's name, its tier (0 Normal, 1 Hard) and
 *  the encounter it is on, by its number in the Breach's list. */
export interface BreachInside {
  readonly name: string;
  readonly tier: number;
  readonly encounter: number;
}

/**
 * A Breach as each snapshot carries it whole (crates/room/src/breach/seen.rs says what each field means): in its run
 * (`gate` false) each encounter's phase, the stage reached, the seals open (a bit each), the revives left (-1 none
 * counted), the Lodestone, the Rewritten, the hidden chests open and the encounter under way; at its gate in the
 * patrol zone (`gate` true) the Waking, who the gate is open to and the companies inside. Ticks count down to a
 * moment, 0 for none coming; shares run 0 to 1.
 */
export interface BreachSeen {
  readonly gate: boolean;
  readonly tier: number;
  readonly phases: readonly number[];
  readonly reached: number;
  readonly seals: number;
  readonly revives: number;
  readonly stone: number;
  readonly bearer: number;
  readonly stoneAt: readonly [number, number, number];
  readonly charge: number;
  readonly held: number;
  readonly lyingTicks: number;
  readonly marked: readonly { readonly player: number; readonly ticks: number }[];
  readonly chests: number;
  readonly encounter: number;
  readonly stage: number;
  readonly stageTicks: number;
  readonly counts: readonly number[];
  readonly bells: readonly number[];
  readonly bellFoes: readonly number[];
  readonly broken: number;
  readonly ringTicks: number;
  readonly fontTicks: number;
  readonly boss: number;
  readonly warded: boolean;
  readonly desk: number;
  readonly markedDesk: number;
  readonly deskTicks: number;
  readonly writeTicks: number;
  readonly seen: boolean;
  readonly wipeTicks: number;
  readonly rifts: readonly number[];
  readonly riftHeld: readonly number[];
  readonly kept: number;
  readonly takings: number;
  readonly takingTicks: number;
  readonly awayShore: number;
  readonly away: readonly number[];
  readonly wayBack: boolean;
  readonly bareTicks: number;
  readonly heldBy: boolean;
  readonly fill: number;
  readonly woken: boolean;
  readonly claims: number;
  readonly openTo: readonly number[];
  /** At a gate, the players of the company holding it. */
  readonly holders: readonly number[];
  readonly inside: readonly BreachInside[];
}

const share = (perMille: number) => perMille / 1000;

/** A snapshot's Breach; null in a room with none. */
export function breachOf(snapshot: Snapshot): BreachSeen | null {
  const read = snapshot.breach();
  if (!read) return null;
  const ticks = Array.from(read.markTicksArray() ?? []);
  const stoneAt = Array.from(read.stoneAtArray() ?? []);
  return {
    gate: read.gate(),
    tier: read.tier(),
    phases: Array.from(read.phasesArray() ?? []),
    reached: read.reached(),
    seals: read.seals(),
    revives: read.revives(),
    stone: read.stone(),
    bearer: read.bearer(),
    stoneAt: [stoneAt[0] ?? 0, stoneAt[1] ?? 0, stoneAt[2] ?? 0],
    charge: share(read.charge()),
    held: share(read.held()),
    lyingTicks: read.lyingTicks(),
    marked: Array.from(read.markedArray() ?? [], (player, index) => ({ player, ticks: ticks[index] ?? 0 })),
    chests: read.chests(),
    encounter: read.encounter(),
    stage: read.stage(),
    stageTicks: read.stageTicks(),
    counts: Array.from(read.countsArray() ?? []),
    bells: Array.from(read.bellsArray() ?? []),
    bellFoes: Array.from(read.bellFoesArray() ?? []),
    broken: read.broken(),
    ringTicks: read.ringTicks(),
    fontTicks: read.fontTicks(),
    boss: read.boss(),
    warded: read.warded(),
    desk: read.desk(),
    markedDesk: read.markedDesk(),
    deskTicks: read.deskTicks(),
    writeTicks: read.writeTicks(),
    seen: read.seen(),
    wipeTicks: read.wipeTicks(),
    rifts: Array.from(read.riftsArray() ?? []),
    riftHeld: Array.from(read.riftHeldArray() ?? [], share),
    kept: read.kept(),
    takings: read.takings(),
    takingTicks: read.takingTicks(),
    awayShore: read.awayShore(),
    away: Array.from(read.awayArray() ?? []),
    wayBack: read.wayBack(),
    bareTicks: read.bareTicks(),
    heldBy: read.heldBy(),
    fill: share(read.fill()),
    woken: read.woken(),
    claims: read.claims(),
    openTo: Array.from(read.openToArray() ?? []),
    holders: Array.from(read.holdersArray() ?? []),
    inside: Array.from({ length: read.insideLength() }, (unused, index) => {
      const company = read.inside(index);
      return { name: company?.name() ?? '', tier: company?.tier() ?? 0, encounter: company?.encounter() ?? 0 };
    }),
  };
}
