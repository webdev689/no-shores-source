import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';

/** The seals' kinds and states by their numbers (crates/room/src/encounter_plan.rs SealKind, encounters.rs
 *  SealState). */
export const SEAL_KIND = { litany: 1, weighing: 2, ascent: 3, holdfast: 4 } as const;
export const SEAL_STATE = { waiting: 0, running: 1, broken: 2 } as const;
/** A Litany's rune: dark, showing in the show, stepped in order, or stepped wrong a moment ago. */
export const RUNE = { dark: 0, showing: 1, stepped: 2, wrong: 3 } as const;

/** One seal as a snapshot carries it: its kind, its state, its progress 0 to 1, its pieces' marks (a Litany's runes
 *  `RUNE`; a Weighing's plates in play and a Holdfast's ring 1 while stood on; an Ascent's players on its stone and
 *  the living players in its room) and its relic's strength 0 to 1. */
export interface SealSeen {
  readonly kind: number;
  readonly state: number;
  readonly progress: number;
  readonly marks: readonly number[];
  readonly relic: number;
}

/** An Elite Dungeon's encounters as a snapshot carries them: each seal; whether the Boss woke, and its number while
 *  it stands (0 for none); the ward up (0 none, 1 at two thirds, 2 at one third) and how many are broken; each
 *  anchor's progress 0 to 1; the ticks until a Reckoning lands (0 while none is shown) and its anchor; Fury's step;
 *  the ticks until Fury begins while its clock runs (0 before and after); and the ticks until the warded Boss's slam
 *  lands (0 while none is shown). */
export interface EncounterSeen {
  readonly seals: readonly SealSeen[];
  readonly woken: boolean;
  readonly boss: number;
  readonly ward: number;
  readonly wardsBroken: number;
  readonly anchors: readonly number[];
  readonly reckoningTicks: number;
  readonly reckoningAt: number;
  readonly fury: number;
  readonly furyTicks: number;
  readonly slamTicks: number;
}

/** A snapshot's encounters; null in a room with none. */
export function encounterOf(snapshot: Snapshot): EncounterSeen | null {
  const read = snapshot.encounter();
  if (!read) return null;
  const seals = Array.from({ length: read.sealsLength() }, (unused, index): SealSeen => {
    const seal = read.seals(index);
    if (!seal) throw new Error(`seal ${index} is missing`);
    return {
      kind: seal.kind(),
      state: seal.state(),
      progress: seal.progress() / 1000,
      marks: Array.from(seal.marksArray() ?? []),
      relic: seal.relic() / 1000,
    };
  });
  return {
    seals,
    woken: read.woken(),
    boss: read.boss(),
    ward: read.ward(),
    wardsBroken: read.wardsBroken(),
    anchors: Array.from(read.anchorsArray() ?? [], (held) => held / 1000),
    reckoningTicks: read.reckoningTicks(),
    reckoningAt: read.reckoningAt(),
    fury: read.fury(),
    furyTicks: read.furyTicks(),
    slamTicks: read.slamTicks(),
  };
}
