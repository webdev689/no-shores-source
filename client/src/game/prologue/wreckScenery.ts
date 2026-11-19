import type { Gpu } from '../../gpu.ts';
import { type ShipMesh, VERTEX_BYTES } from '../../ships/shipMesh.ts';
import { type ShipPlace, ShipView } from '../../ships/shipView.ts';
import { SHIP_PARTS, type ShipPart } from '../../textures/shipPictures.ts';
import type { Drawer } from '../scene.ts';
import type { Scenery, SceneryKind, WreckLayout } from './wreckLayout.ts';

/** How deep each kind is drawn under its top, metres (a crate and a spar as deep as they are wide, so this is the
 *  most), and the ship's picture it wears: planks and crates the deck's boards, spars a spar's grain, debris the
 *  hull's strakes. The block a body stands on still reaches down to the sea. */
const LOOKS: Readonly<Record<SceneryKind, { readonly depth: number; readonly part: ShipPart }>> = {
  planks: { depth: 0.12, part: 'deck' },
  crate: { depth: 1.2, part: 'deck' },
  spar: { depth: 0.8, part: 'spar' },
  debris: { depth: 2.6, part: 'hull' },
};

/** The six faces of a box: its normal and its four corners as picks of (west or east, north or south, bottom or
 *  top), and which two of the box's axes lay its picture. */
const FACES: readonly { normal: readonly number[]; corners: readonly (readonly number[])[]; uv: readonly number[] }[] =
  [
    {
      normal: [0, 0, 1],
      corners: [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
      uv: [0, 1],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
      uv: [0, 2],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [1, 1, 0],
        [0, 1, 0],
        [0, 1, 1],
        [1, 1, 1],
      ],
      uv: [0, 2],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [0, 1, 0],
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
      ],
      uv: [1, 2],
    },
    {
      normal: [1, 0, 0],
      corners: [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
        [1, 0, 1],
      ],
      uv: [1, 2],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
        [0, 0, 0],
      ],
      uv: [0, 1],
    },
  ];

/** The blocks that show as one mesh in the ships' own frame laid square to the world (x east, y south, z up),
 *  measured from `origin`: each a box of its kind's depth under its top, in its kind's picture, its UVs in metres. */
export function sceneryMesh(scenery: readonly Scenery[], origin: readonly [number, number]): ShipMesh {
  const vertexCount = scenery.length * FACES.length * 4;
  const vertices = new ArrayBuffer(vertexCount * VERTEX_BYTES);
  const view = new DataView(vertices);
  const indices = new Uint32Array(scenery.length * FACES.length * 6);
  let vertex = 0;
  let written = 0;
  for (const { kind, block } of scenery) {
    const look = LOOKS[kind];
    const bottom = Math.max(0, block.top - look.depth);
    const span = [
      [block.minX - origin[0], block.maxX - origin[0]],
      [block.minY - origin[1], block.maxY - origin[1]],
      [bottom, block.top],
    ];
    for (const face of FACES) {
      face.corners.forEach((pick, index) => {
        const corner = pick.map((side, axis) => span[axis]?.[side] ?? 0);
        const offset = (vertex + index) * VERTEX_BYTES;
        corner.forEach((value, axis) => view.setFloat32(offset + axis * 4, value, true));
        face.normal.forEach((value, axis) => view.setInt8(offset + 12 + axis, value * 127));
        face.uv.forEach((axis, index) => view.setFloat32(offset + 16 + index * 4, corner[axis] ?? 0, true));
        view.setUint8(offset + 24, SHIP_PARTS.indexOf(look.part));
      });
      indices.set([vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3], written);
      vertex += 4;
      written += 6;
    }
  }
  return { name: 'wreck', vertexCount, vertices, indices, waterline: { lengthM: 1, beamM: 1, draughtM: 0 } };
}

/** The heading that lays a ship's own frame on the world's: her bow east, her starboard south. */
const SQUARE_TO_THE_WORLD = Math.PI / 2;

/**
 * The wreck as drawn: both ships from one published mesh (`hull`, the Brig's), each where she lies and the rammer at her size, her
 * canvas struck; and the blocks that show, in timber from the ships' own pictures. The gate is drawn once it stands.
 */
export class WreckScenery {
  private readonly ships: ShipView;
  private readonly places: readonly ShipPlace[];
  private readonly pieces: ShipView;
  private readonly gate: ShipView;
  private readonly placed: ShipPlace;
  gateStands = false;

  constructor(gpu: Gpu, hull: ShipMesh, layout: WreckLayout, origin: readonly [number, number]) {
    this.ships = new ShipView(gpu, hull, [], layout.ships.length);
    this.places = layout.ships.map(({ lying }) => ({ ...lying, z: lying.heave }));
    this.pieces = new ShipView(gpu, sceneryMesh(layout.scenery, origin), [], 1);
    this.gate = new ShipView(gpu, sceneryMesh([{ kind: 'debris', block: layout.arena.gate }], origin), [], 1);
    this.placed = { x: origin[0], y: origin[1], z: 0, heading: SQUARE_TO_THE_WORLD, pitch: 0, roll: 0 };
  }

  /** The drawer the scene draws it with. */
  get drawer(): Drawer {
    return {
      drawInto: (pass, fromEye, shot) => {
        const camera = { fromEye, eye: shot.eye };
        this.places.forEach((place, slot) => this.ships.drawInto(pass, place, camera, slot));
        this.pieces.drawInto(pass, this.placed, camera);
        if (this.gateStands) this.gate.drawInto(pass, this.placed, camera);
      },
    };
  }
}
