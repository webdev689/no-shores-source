// An Elite Dungeon's encounters as stone and water: each Ascent's pads in its room's own dressed stone, a band of trim
// round each top and the seal stone glowing on the last; a slab under each of the Court's anchors and a crystal over
// each Holdfast's relic; and, while an Ascent's seal holds, the dungeon's still water over its drowned floor. The
// pads are the blocks the room's bodies climb, laid where the room lays them (`room_dungeon`).
import { type ForgedModel, type MeshBuilder, meshBuilder } from '../models/model.ts';
import { type EncounterSeen, SEAL_KIND, SEAL_STATE } from '../network/encounterMessages.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { box, COLOUR, face, lookOf, ROLE } from './dungeonMesh.ts';

/** A pad's trim band under its top, the seal stone's inset and height over the last pad, an anchor's slab, and the
 *  relic's crystal over its ring's middle (m). */
const PAD_TRIM_M = 0.08;
const STONE = { inset: 0.35, height: 0.06 } as const;
const SLAB = { half: 0.6, height: 0.03 } as const;
const RELIC = { half: 0.18, low: 1.9, high: 2.6 } as const;
/** How far over the floor the drowned floor's water lies (m): over the floor's own face, under a body's step. */
const WATER_M = 0.04;

/** The set a seal's room wears. */
function setOf(layout: DungeonLayout, room: number): number {
  return lookOf(layout, room, layout.rooms[room]?.look ?? 0).set;
}

/** Lays the encounters' standing pieces into the dungeon's mesh: each Ascent's pads, each anchor's slab and each
 *  Holdfast's crystal. */
export function layEncounters(mesh: MeshBuilder, layout: DungeonLayout): void {
  const plan = layout.encounters;
  if (!plan) return;
  for (const seal of plan.seals) {
    const set = setOf(layout, seal.room);
    seal.pads.forEach(([minX, minY, maxX, maxY, top], index) => {
      box(mesh, [set, ROLE.wall], [minX, minY, 0], [maxX, maxY, top - PAD_TRIM_M], false);
      box(mesh, [set, ROLE.trim], [minX, minY, top - PAD_TRIM_M], [maxX, maxY, top], false);
      face(mesh, [set, ROLE.floor], cornersAt(minX, minY, maxX, maxY, top), [0, 0, 1], top);
      if (index === seal.pads.length - 1) {
        const [low, high] = [STONE.inset, STONE.inset];
        box(mesh, [COLOUR.crystal, 0], [minX + low, minY + low, top], [maxX - high, maxY - high, top + STONE.height]);
      }
    });
    const [relic] = seal.pieces;
    if (seal.kind === SEAL_KIND.holdfast && relic) {
      const [x, y] = relic;
      box(
        mesh,
        [COLOUR.crystal, 0],
        [x - RELIC.half, y - RELIC.half, RELIC.low],
        [x + RELIC.half, y + RELIC.half, RELIC.high],
      );
    }
  }
  const end = setOf(layout, layout.end);
  for (const [x, y] of plan.anchors)
    box(mesh, [end, ROLE.trim], [x - SLAB.half, y - SLAB.half, 0], [x + SLAB.half, y + SLAB.half, SLAB.height]);
}

/** A flat face's corners at `top`, clockwise from the north-west seen from above. */
function cornersAt(minX: number, minY: number, maxX: number, maxY: number, top: number) {
  return [
    [minX, minY, top],
    [maxX, minY, top],
    [maxX, maxY, top],
    [minX, maxY, top],
  ] as const;
}

/** Which Ascents' floors lie drowned now: each one whose seal is not broken, by its number among the seals. */
export function drownedNow(layout: DungeonLayout, seen: EncounterSeen | null): number[] {
  const seals = layout.encounters?.seals ?? [];
  return seals.flatMap((seal, index) =>
    seal.kind === SEAL_KIND.ascent && seen?.seals[index]?.state !== SEAL_STATE.broken ? [index] : [],
  );
}

/** The still water over the drowned floors of `drowned` (`drownedNow`), each cell its own face over its room's set's
 *  floor; null for none. */
export function waterMesh(layout: DungeonLayout, drowned: readonly number[]): ForgedModel | null {
  const seals = layout.encounters?.seals ?? [];
  if (drowned.length === 0) return null;
  const mesh = meshBuilder();
  for (const index of drowned) {
    const seal = seals[index];
    if (!seal) continue;
    const set = setOf(layout, seal.room);
    for (const cell of seal.drowned) {
      const [x, y] = [(cell % layout.columns) * layout.cell, Math.floor(cell / layout.columns) * layout.cell];
      face(mesh, [COLOUR.water, set], cornersAt(x, y, x + layout.cell, y + layout.cell, WATER_M), [0, 0, 1], WATER_M);
    }
  }
  return mesh.model();
}
