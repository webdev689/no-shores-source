// A storeyed dungeon cut into its storeys, each a one-storey dungeon of its own with z from its floor: its plane of
// cells, and the torches, fixtures, glows, props, pillars, doorways, solids, landmarks and seals that stand on it. The
// mesh, the kits and the furnishing draw a storey as they draw a one-storey dungeon, into a mesh raised to its floor,
// so nothing that lays a room needs to know of storeys. A one-storey dungeon is its own only storey, unchanged.
import type { MeshBuilder } from '../models/model.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import {
  type Box,
  type DungeonLayout,
  floorOf,
  planeOf,
  type SealLayout,
  storeyOf,
  storeysOf,
  storeyUnder,
} from './dungeonLayout.ts';

/** One storey: its number and floor, itself as a one-storey layout, the number in the whole layout of each of its
 *  torches, pillars and props, and whether the exit door and the portal stand on it. */
export interface StoreyPlane {
  readonly storey: number;
  readonly floor: number;
  readonly layout: DungeonLayout;
  readonly torches: readonly number[];
  readonly pillars: readonly number[];
  readonly props: readonly number[];
  readonly exit: boolean;
  readonly portal: boolean;
}

/** Where nothing stands: the exit door and the portal of a storey that holds neither, off the grid. */
const NOWHERE = -1000;

/** Each storey of a layout, the top first. */
export function storeyPlanes(layout: DungeonLayout): StoreyPlane[] {
  const every = (list: readonly unknown[]) => list.map((_unused, index) => index);
  if (storeysOf(layout) <= 1)
    return [
      {
        storey: 0,
        floor: floorOf(layout, 0),
        layout,
        torches: every(layout.torches),
        pillars: every(layout.pillars),
        props: every(layout.props),
        exit: true,
        portal: true,
      },
    ];
  return Array.from({ length: storeysOf(layout) }, (_unused, storey) => planeOfStorey(layout, storey));
}

/** The numbers of a list's entries on a storey, by the height each gives. */
function onStorey<T>(layout: DungeonLayout, list: readonly T[], storey: number, height: (each: T) => number) {
  return list.flatMap((each, index) => (storeyUnder(layout, height(each)) === storey ? [index] : []));
}

/** Each landmark's storey: its first solid's, the landmarks' solids ending the boxes in the landmarks' order. */
function landmarkStoreys(layout: DungeonLayout): number[] {
  const counts = placedLandmarks(layout).map((landmark) => landmark.solids.length);
  let first = layout.boxes.length - counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count) => {
    const solid = layout.boxes[first];
    first += count;
    return solid ? storeyUnder(layout, solid[4] + 0.01) : 0;
  });
}

function planeOfStorey(layout: DungeonLayout, storey: number): StoreyPlane {
  const floor = floorOf(layout, storey);
  const plane = layout.columns * layout.rows;
  const slice = <T>(list: readonly T[]) => list.slice(storey * plane, (storey + 1) * plane);
  const here = (cell: number) => storeyOf(layout, cell) === storey;
  const lowered = (box: Box): Box => [box[0], box[1], box[2], box[3], box[4] - floor, box[5] - floor];
  const point = <T extends readonly number[]>(each: T): T =>
    [each[0], each[1], (each[2] ?? 0) - floor, ...each.slice(3)] as unknown as T;
  const torches = onStorey(layout, layout.torches, storey, (torch) => torch[2]);
  const pillars = onStorey(layout, layout.pillars, storey, (pillar) => pillar[2] - 0.01);
  const props = onStorey(layout, layout.props, storey, (prop) => prop[3]);
  const frames = layout.frames.flatMap((frame, index) => (here(frame[0]) ? [index] : []));
  const jambs = frames.flatMap((index) => layout.boxes.slice(index * 2, index * 2 + 2)).map(lowered);
  const solids = layout.boxes
    .slice(layout.frames.length * 2)
    .filter((box) => storeyUnder(layout, box[4] + 0.01) === storey)
    .map(lowered);
  const landmarkAt = landmarkStoreys(layout);
  const sealHere = (seal: SealLayout) => (layout.rooms[seal.room]?.storey ?? 0) === storey;
  const seal = (each: SealLayout): SealLayout => ({
    ...each,
    pieces: each.pieces.map(point),
    pads: each.pads.map(([minX, minY, maxX, maxY, top, bottom]) =>
      bottom === undefined
        ? [minX, minY, maxX, maxY, top - floor]
        : [minX, minY, maxX, maxY, top - floor, bottom - floor],
    ),
    drowned: each.drowned.map((cell) => planeOf(layout, cell)),
    doors: each.doors.map(([x, y, z]) => [x, y, (z ?? floor) - floor] as const),
  });
  const exit = here(layout.wayIn.cell);
  const portal = storeyUnder(layout, (layout.portal.z ?? 0) + 0.01) === storey;
  const encounters = layout.encounters && {
    ...layout.encounters,
    seals: layout.encounters.seals.filter(sealHere).map(seal),
    anchors: (layout.rooms[layout.end]?.storey ?? 0) === storey ? layout.encounters.anchors.map(point) : [],
  };
  const local: DungeonLayout = {
    ...layout,
    // The kits draw by the name and a cell's plane number: each storey its own draw.
    name: storey === 0 ? layout.name : `${layout.name} ${storey}`,
    storeys: 1,
    floors: [0],
    stairs: [],
    cells: slice(layout.cells),
    ceilings: slice(layout.ceilings),
    cellLooks: slice(layout.cellLooks),
    wayIn: { ...layout.wayIn, cell: exit ? planeOf(layout, layout.wayIn.cell) : -1 },
    arrival:
      storeyUnder(layout, (layout.arrival.z ?? 0) + 0.01) === storey
        ? { ...layout.arrival, z: (layout.arrival.z ?? 0) - floor }
        : { ...layout.arrival, x: NOWHERE, y: NOWHERE },
    exitDoor: exit ? { ...layout.exitDoor, z: 0 } : { ...layout.exitDoor, x: NOWHERE, y: NOWHERE },
    portal: portal ? { ...layout.portal, z: 0 } : { ...layout.portal, x: NOWHERE, y: NOWHERE },
    torches: torches.map((index) => point(layout.torches[index]!)),
    fixtures: layout.fixtures.filter((each) => storeyUnder(layout, each[2]) === storey).map(point),
    glows: layout.glows.filter((each) => storeyUnder(layout, each[2]) === storey).map(point),
    props: props.map((index) => {
      const [model, x, y, z, yaw] = layout.props[index]!;
      return [model, x, y, z - floor, yaw] as const;
    }),
    pillars: pillars.map((index) => point(layout.pillars[index]!)),
    frames: frames.map((index) => {
      const [cell, side, height] = layout.frames[index]!;
      return [planeOf(layout, cell), side, height] as const;
    }),
    boxes: [...jambs, ...solids],
    landmarks: layout.landmarks.filter((_landmark, index) => (landmarkAt[index] ?? 0) === storey),
    ...(encounters ? { encounters } : {}),
  };
  return { storey, floor, layout: local, torches, pillars, props, exit, portal };
}

/** A mesh builder that lays every corner `rise` metres higher into `mesh`: a storey drawn from its own floor. */
export function raised(mesh: MeshBuilder, rise: number): MeshBuilder {
  if (rise === 0) return mesh;
  const up = (corners: readonly (readonly number[])[]) =>
    corners.map(([x = 0, y = 0, z = 0]) => [x, y, z + rise] as const);
  return {
    quad: (picture, corners, normal, mapping) => mesh.quad(picture, up(corners), normal, mapping),
    tri: (picture, corners, normal, mapping, cornerNormals) =>
      mesh.tri(picture, up(corners), normal, mapping, cornerNormals),
    model: () => mesh.model(),
  };
}
