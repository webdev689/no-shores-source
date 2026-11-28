// An Elite Dungeon's encounters as stone and water: each Ascent's pads in its room's own dressed stone, a band of trim
// round each top, iron rungs up their sides and the seal stone glowing on the last; each Weighing's plates as raised
// slabs of its room's trim; each Holdfast's relic a crystal hung on chains from the ceiling; and round each rune, plate
// and relic a ring of iron inlaid in the floor just outside its mark, a Litany's and a Weighing's joined by iron spokes
// to a hub amid them. A slab under each of the Court's anchors; and, while an
// Ascent's seal holds, foul water over its drowned floor, tinted apart from the dungeon's plain still water as the floor
// that harms. All drawn only: nothing a body meets but the pads, the blocks the room's bodies climb, laid where the room
// lays them (`room_dungeon`).
import { type ForgedModel, type MeshBuilder, meshBuilder } from '../models/model.ts';
import { type EncounterSeen, SEAL_KIND, SEAL_STATE } from '../network/encounterMessages.ts';
import { cellAt } from './dungeonCells.ts';
import {
  type DungeonLayout,
  type EncounterLayout,
  floorOf,
  planeOf,
  type SealLayout,
  storeyOf,
} from './dungeonLayout.ts';
import { box, COLOUR, face, IRON, lookOf, ROLE } from './dungeonMesh.ts';

/** A pad's trim band under its top, the seal stone's inset and height over the last pad, an anchor's slab, and the
 *  relic's crystal over its ring's middle (m). */
const PAD_TRIM_M = 0.08;
const STONE = { inset: 0.35, height: 0.06 } as const;
/** An anchor's slab: stepped, a wider foot under its top, raised over a plate so it is seen across the end room. */
export const ANCHOR_SLAB = { half: 0.75, height: 0.08, rim: 0.12 } as const;
/** A Weighing's plate: a slab as wide as a body standing on it is held, raised under a step. */
export const PLATE = { half: 0.8, height: 0.06, rim: 0.1 } as const;
const RELIC = { half: 0.18, low: 1.9, high: 2.6 } as const;
/** How far over the floor the drowned floor's water lies (m): over the floor's own face, under a body's step. */
const WATER_M = 0.04;

/** A seal room's rite, inlaid in iron just over the floor: each ring's band and how far outside its piece's own mark it
 *  lies, the pieces it is cut into, a spoke's width and how far short of a ring it stops, and the hub's radius; an
 *  Ascent's rungs, one every so high from the first, their thickness and how far proud of the pad; and a Holdfast's
 *  chains' links (m). */
const RITE = { inlay: 0.008, band: 0.16, outside: 0.22, segments: 24, spoke: 0.1, hub: 0.35 } as const;
const RUNG = { every: 0.35, first: 0.3, thick: 0.035, proud: 0.03 } as const;
const LINK = { long: 0.09, wide: 0.05, apart: 0.14 } as const;

type Picture = readonly [number, number];

/** The set a seal's room wears. */
function setOf(layout: DungeonLayout, room: number): number {
  return lookOf(layout, room, layout.rooms[room]?.look ?? 0).set;
}

/** Lays the encounters' standing pieces into the dungeon's mesh: each Ascent's pads, each Weighing's plates, each
 *  anchor's slab and each Holdfast's crystal. */
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
    if (seal.kind === SEAL_KIND.weighing)
      for (const [x, y] of seal.pieces) {
        // All of it the room's trim, not its floor's picture, so the slab stands apart from the floor round it.
        const [low, high] = [PLATE.half, PLATE.half - PLATE.rim];
        box(mesh, [set, ROLE.trim], [x - low, y - low, 0], [x + low, y + low, PLATE.height / 2]);
        box(mesh, [set, ROLE.trim], [x - high, y - high, PLATE.height / 2], [x + high, y + high, PLATE.height]);
      }
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
  for (const seal of plan.seals) rite(mesh, layout, seal, plan.reach);
  const end = setOf(layout, layout.end);
  for (const [x, y] of plan.anchors) {
    const [low, high, height] = [ANCHOR_SLAB.half, ANCHOR_SLAB.half - ANCHOR_SLAB.rim, ANCHOR_SLAB.height];
    box(mesh, [end, ROLE.trim], [x - low, y - low, 0], [x + low, y + low, height / 2]);
    box(mesh, [end, ROLE.trim], [x - high, y - high, height / 2], [x + high, y + high, height]);
  }
}

/** Lays a flat strip `wide` across just over the floor, from `from` to `to` (x, y), where both ends lie in `room`. */
function inlaid(
  mesh: MeshBuilder,
  layout: DungeonLayout,
  [room, picture]: readonly [number, Picture],
  [fromX = 0, fromY = 0]: readonly number[],
  [toX = 0, toY = 0]: readonly number[],
  wide: number,
): void {
  const inRoom = (x: number, y: number) => layout.cells[cellAt(layout, x, y)] === room;
  if (!inRoom(fromX, fromY) || !inRoom(toX, toY)) return;
  const length = Math.hypot(toX - fromX, toY - fromY) || 1;
  const [acrossX, acrossY] = [(-(toY - fromY) / length) * (wide / 2), ((toX - fromX) / length) * (wide / 2)];
  const corners = [
    [fromX - acrossX, fromY - acrossY, RITE.inlay],
    [toX - acrossX, toY - acrossY, RITE.inlay],
    [toX + acrossX, toY + acrossY, RITE.inlay],
    [fromX + acrossX, fromY + acrossY, RITE.inlay],
  ] as const;
  face(mesh, picture, corners, [0, 0, 1], RITE.inlay);
}

/** A seal room's rite, in iron inlaid in its floor where it lies in the seal's room: a ring round each rune and plate
 *  just outside its mark (round the relic, outside the ring its company holds), and from a hub amid them a spoke out to
 *  each; an Ascent's pads take rungs, and a Holdfast's relic hangs on chains. */
function rite(mesh: MeshBuilder, layout: DungeonLayout, seal: SealLayout, reach: EncounterLayout['reach']): void {
  const iron: readonly [number, Picture] = [seal.room, IRON];
  const ring = ([x, y]: readonly number[], radius: number) => {
    const point = (nth: number) => {
      const turn = (nth / RITE.segments) * Math.PI * 2;
      return [(x ?? 0) + Math.cos(turn) * radius, (y ?? 0) + Math.sin(turn) * radius];
    };
    for (let piece = 0; piece < RITE.segments; piece++)
      inlaid(mesh, layout, iron, point(piece), point(piece + 1), RITE.band);
  };
  const [relic] = seal.pieces;
  if (seal.kind === SEAL_KIND.holdfast && relic) {
    ring(relic, reach.relic + RITE.outside + RITE.band / 2);
    chains(mesh, layout, relic);
  }
  if (seal.kind === SEAL_KIND.ascent) for (const pad of seal.pads) rungs(mesh, pad);
  if (seal.kind !== SEAL_KIND.litany && seal.kind !== SEAL_KIND.weighing) return;
  const own = (seal.kind === SEAL_KIND.litany ? reach.rune : PLATE.half) + RITE.outside + RITE.band / 2;
  const hubX = seal.pieces.reduce((sum, [x]) => sum + x, 0) / seal.pieces.length;
  const hubY = seal.pieces.reduce((sum, [, y]) => sum + y, 0) / seal.pieces.length;
  ring([hubX, hubY], RITE.hub);
  for (const [x, y] of seal.pieces) {
    ring([x, y], own);
    const away = Math.hypot(x - hubX, y - hubY);
    if (away < own + RITE.hub) continue;
    const along = (out: number) => [hubX + ((x - hubX) / away) * out, hubY + ((y - hubY) / away) * out];
    inlaid(mesh, layout, iron, along(RITE.hub), along(away - own), RITE.spoke);
  }
}

/** Iron rungs up each side of a pad, one every RUNG.every from RUNG.first to under its top. */
function rungs(mesh: MeshBuilder, [minX, minY, maxX, maxY, top]: SealLayout['pads'][number]): void {
  const { proud, thick } = RUNG;
  for (let low = RUNG.first; low < top - 0.15; low += RUNG.every) {
    const high = low + thick;
    box(mesh, IRON, [minX + 0.15, minY - proud, low], [maxX - 0.15, minY, high]);
    box(mesh, IRON, [minX + 0.15, maxY, low], [maxX - 0.15, maxY + proud, high]);
    box(mesh, IRON, [minX - proud, minY + 0.15, low], [minX, maxY - 0.15, high]);
    box(mesh, IRON, [maxX, minY + 0.15, low], [maxX + proud, maxY - 0.15, high]);
  }
}

/** Two chains from the Holdfast's relic up to the ceiling over it, their links turned each way in turn. */
function chains(mesh: MeshBuilder, layout: DungeonLayout, [x = 0, y = 0]: readonly number[]): void {
  const ceiling = layout.ceilings[cellAt(layout, x, y)] ?? 0;
  for (const side of [-1, 1]) {
    const chainX = x + side * LINK.apart;
    for (let low = RELIC.high, nth = 0; low + LINK.long <= ceiling; low += LINK.long, nth++) {
      const [halfX, halfY] = nth % 2 === 0 ? [LINK.wide / 2, 0.01] : [0.01, LINK.wide / 2];
      box(mesh, IRON, [chainX - halfX, y - halfY, low], [chainX + halfX, y + halfY, low + LINK.long]);
    }
  }
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

/** The foul water over the drowned floors of `drowned` (`drownedNow`), each cell its own face over its room's set's
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
      const flat = planeOf(layout, cell);
      const [x, y] = [(flat % layout.columns) * layout.cell, Math.floor(flat / layout.columns) * layout.cell];
      const level = floorOf(layout, storeyOf(layout, cell)) + WATER_M;
      face(mesh, [COLOUR.foulWater, set], cornersAt(x, y, x + layout.cell, y + layout.cell, level), [0, 0, 1], level);
    }
  }
  return mesh.model();
}
