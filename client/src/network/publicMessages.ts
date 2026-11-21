import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';
import { point } from './fleetMessages.ts';

/** What a public event's mark is of (crates/room/src/public/seen.rs). */
export const MARK = {
  fissure: 1,
  growth: 2,
  store: 3,
  shard: 4,
  carried: 5,
  titheTaker: 6,
  banner: 7,
  approach: 8,
} as const;

/** The events by their numbers, and how one stands. */
export const PUBLIC_KIND = { none: 0, fissure: 1, raid: 2 } as const;
export const PUBLIC_PHASE = { waiting: 0, running: 1, won: 2, failed: 3 } as const;
export const HEROIC = { notYet: 0, offered: 1, met: 2, missed: 3 } as const;

/** Something of a public event the page draws: what it is (`MARK`), its number (a carried shard's is its carrier's,
 *  the growth's and the tithe-taker's their foe's), where it is, its health 0 to 1 (the fissure's: how far open; a
 *  shard's: its life left), and its state (the growth: 1 rising, 2 standing, 3 sinking, 4 broken; a store: 1 whole,
 *  2 plundered; the tithe-taker: 1 arriving, 2 counting, 3 leaving). */
export interface PublicMark {
  readonly kind: number;
  readonly id: number;
  readonly at: readonly [number, number, number];
  readonly health: number;
  readonly state: number;
}

/** A zone's public events as a snapshot carries them: the one running or showing its result (`PUBLIC_KIND`, 0 for
 *  none), its phase, its ground's middle and radius and its countdown in ticks (its result's time left once won or
 *  failed); the next's kind, ground and ticks until it starts; its stage of how many; its progress toward what it
 *  needs (shards set of shards needed, or the stores' health left per mille of 1000); its heroic task (`HEROIC`) and
 *  its window's ticks left; whether its bonus holds; its marks; and the ticks until a raid's next wave comes in (0
 *  while none is on its way). */
export interface PublicEvent {
  readonly kind: number;
  readonly phase: number;
  readonly ground: readonly [number, number, number];
  readonly radius: number;
  readonly ticksLeft: number;
  readonly nextKind: number;
  readonly nextGround: readonly [number, number, number];
  readonly nextTicks: number;
  readonly stage: number;
  readonly stages: number;
  readonly progress: number;
  readonly needed: number;
  readonly heroic: number;
  readonly heroicTicks: number;
  readonly bonus: boolean;
  readonly marks: readonly PublicMark[];
  readonly nextWaveTicks: number;
}

/** A snapshot's public events; null in a room whose zone holds none. */
export function publicOf(snapshot: Snapshot): PublicEvent | null {
  const event = snapshot.publicEvent();
  if (!event) return null;
  const marks = Array.from({ length: event.marksLength() }, (unused, index): PublicMark => {
    const mark = event.marks(index);
    if (!mark) throw new Error(`public mark ${index} is missing`);
    const at: [number, number, number] = [mark.x(), mark.y(), mark.z()];
    return { kind: mark.kind(), id: mark.id(), at, health: mark.health(), state: mark.state() };
  });
  return {
    kind: event.kind(),
    phase: event.phase(),
    ground: point(event.groundArray()),
    radius: event.radius(),
    ticksLeft: event.ticksLeft(),
    nextKind: event.nextKind(),
    nextGround: point(event.nextGroundArray()),
    nextTicks: event.nextTicks(),
    stage: event.stage(),
    stages: event.stages(),
    progress: event.progress(),
    needed: event.needed(),
    heroic: event.heroic(),
    heroicTicks: event.heroicTicks(),
    bonus: event.bonus(),
    marks,
    nextWaveTicks: event.nextWaveTicks(),
  };
}
