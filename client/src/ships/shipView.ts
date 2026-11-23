import { sphereAround } from '../frustum.ts';
import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import { ShadowMap } from '../shadow.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import { DRESSES, PLAYER_LOOK, SHIP_SIDES, type ShipLook } from './dress.ts';
import { flagFlat, flagGrid } from './flag.ts';
import type { HullPaint } from './hulls.ts';
import { SAIL_COLUMNS, SAIL_ROWS, type SailCorners, type SailRig } from './sails.ts';
import { shipAxes } from './shipAxes.ts';
import type { ShipHarm } from './shipHarm.ts';
import { type ShipMesh, VERTEX_BYTES, type Waterline } from './shipMesh.ts';
import { cellShows, flagAt, harmedCanvas, mastFalls } from './harmDrawn.ts';
import {
  bufferOf,
  MAST_FLOATS_AT,
  MOST_MASTS,
  MOST_YARDS,
  PLACE_FLOATS,
  picturesTexture,
  type ShipKit,
  shipKit,
  YARD_FLOATS_AT,
} from './shipShader.ts';
import { tagShip, type ShipTags } from './shipTags.ts';

export { FRONT_FACE } from './shipShader.ts';

/** Where a ship is drawn: its middle in window metres (its height as drawn), its heading (radians clockwise from
 *  north), its bow's rise and its heel to starboard (radians), and how many times its size (1 unless said). */
export interface ShipPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly scale?: number;
}

/** The camera it is drawn from: its matrix from the eye, and the eye in window metres as drawn. */
export interface ShipCamera {
  readonly fromEye: Float32Array;
  readonly eye: readonly [number, number, number];
}

/** The matrix (column-major, 4 × 4) that turns its own frame (x to its bow, y to starboard, z up) into the world's
 *  (east, south, up): its roll, then its pitch, then its heading. */
export function shipTurn(heading: number, pitch: number, roll: number): Float32Array<ArrayBuffer> {
  const turn = new Float32Array(16);
  shipAxes(heading, pitch, roll).forEach((column, index) => turn.set(column, index * 4));
  turn[15] = 1;
  return turn;
}

/** Its stripe stands this far either side of the line of its upper gunports, metres. */
export const STRIPE_HALF_M = 0.3;

/** A canvas's grid as triangles, two a cell, each sail's after the last's, but a cell `shows` says is gone (a hole,
 *  or a sail or flag no longer drawn). */
export function canvasIndices(
  sails: number,
  shows: (sail: number, cell: number) => boolean = () => true,
): Uint32Array<ArrayBuffer> {
  // Written in place, a ship's every frame: a hole only shortens it.
  const corners = new Uint32Array(sails * (SAIL_ROWS - 1) * (SAIL_COLUMNS - 1) * 6);
  let laid = 0;
  for (let sail = 0; sail < sails; sail++)
    for (let row = 0; row < SAIL_ROWS - 1; row++)
      for (let column = 0; column < SAIL_COLUMNS - 1; column++) {
        if (!shows(sail, row * (SAIL_COLUMNS - 1) + column)) continue;
        const first = sail * SAIL_COLUMNS * SAIL_ROWS + row * SAIL_COLUMNS + column;
        const up = first + SAIL_COLUMNS;
        corners[laid] = first;
        corners[laid + 1] = first + 1;
        corners[laid + 2] = up + 1;
        corners[laid + 3] = first;
        corners[laid + 4] = up + 1;
        corners[laid + 5] = up;
        laid += 6;
      }
  return laid === corners.length ? corners : corners.slice(0, laid);
}

/** The canvas's vertices, as its mesh's are, from each sail's grid now: a point's normal across its neighbours (the
 *  side its triangles face on the screen, as the export keeps its own), its UV the metres of its sail laid flat, its
 *  picture the sail's but where `layers` names another (its flag's). */
export function canvasVertices(
  canvas: readonly Float32Array[],
  flat: readonly Float32Array[],
  layers: readonly number[] = [],
): ArrayBuffer {
  const bytes = new ArrayBuffer(canvas.length * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES);
  const view = new DataView(bytes);
  const sailPart = SHIP_PARTS.indexOf('sail');
  canvas.forEach((points, sail) => {
    // Each sail's every point, every frame: its neighbours read by index, as the edges' clamp gives them.
    const place = (column: number, row: number): number => (row * SAIL_COLUMNS + column) * 3;
    for (let row = 0; row < SAIL_ROWS; row++)
      for (let column = 0; column < SAIL_COLUMNS; column++) {
        const left = place(Math.max(0, column - 1), row);
        const right = place(Math.min(SAIL_COLUMNS - 1, column + 1), row);
        const below = place(column, Math.max(0, row - 1));
        const above = place(column, Math.min(SAIL_ROWS - 1, row + 1));
        const alongX = (points[right] ?? 0) - (points[left] ?? 0);
        const alongY = (points[right + 1] ?? 0) - (points[left + 1] ?? 0);
        const alongZ = (points[right + 2] ?? 0) - (points[left + 2] ?? 0);
        const upX = (points[above] ?? 0) - (points[below] ?? 0);
        const upY = (points[above + 1] ?? 0) - (points[below + 1] ?? 0);
        const upZ = (points[above + 2] ?? 0) - (points[below + 2] ?? 0);
        // The mirrored frame: a face's front is where (up × along) points, as its export's normals are.
        const normalX = upY * alongZ - upZ * alongY;
        const normalY = upZ * alongX - upX * alongZ;
        const normalZ = upX * alongY - upY * alongX;
        const length = Math.hypot(normalX, normalY, normalZ) || 1;
        const byte = ((sail * SAIL_ROWS + row) * SAIL_COLUMNS + column) * VERTEX_BYTES;
        const grid = place(column, row);
        view.setFloat32(byte, points[grid] ?? 0, true);
        view.setFloat32(byte + 4, points[grid + 1] ?? 0, true);
        view.setFloat32(byte + 8, points[grid + 2] ?? 0, true);
        view.setInt8(byte + 12, Math.round((normalX / length) * 127));
        view.setInt8(byte + 13, Math.round((normalY / length) * 127));
        view.setInt8(byte + 14, Math.round((normalZ / length) * 127));
        const laid = flat[sail];
        view.setFloat32(byte + 16, laid?.[grid] ?? 0, true);
        view.setFloat32(byte + 20, laid?.[grid + 2] ?? 0, true);
        view.setUint8(byte + 24, layers[sail] ?? sailPart);
      }
  });
  return bytes;
}

/** Where its tallest mast's head is, in its frame: the highest point of its spars. */
export function mastheadOf(mesh: ShipMesh): [number, number, number] {
  const view = new DataView(mesh.vertices);
  const spar = SHIP_PARTS.indexOf('spar');
  let top: [number, number, number] = [0, 0, -Infinity];
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const byte = vertex * VERTEX_BYTES;
    const z = view.getFloat32(byte + 8, true);
    if (view.getUint8(byte + 24) === spar && z > top[2])
      top = [view.getFloat32(byte, true), view.getFloat32(byte + 4, true), z];
  }
  if (top[2] === -Infinity) throw new Error(`the ${mesh.name || 'ship'} has no spars to fly a flag from`);
  return top;
}

/** Its bounding sphere in its own frame, [x, y, z, radius]: about the middle of its mesh and its sails' corners, and
 *  twice as far as the farthest of them, so a yard braced or a boom swung any way about its mast, its canvas filled
 *  and its flag flying (a tenth of its length from its masthead) all stay inside. */
export function shipSphere(mesh: ShipMesh, sails: readonly SailCorners[]): [number, number, number, number] {
  const stride = VERTEX_BYTES / 4;
  const positions = new Float32Array(mesh.vertices, 0, mesh.vertexCount * stride);
  const points: number[] = [];
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++)
    points.push(...positions.subarray(vertex * stride, vertex * stride + 3));
  for (const sail of sails)
    for (const value of Object.values(sail)) if (typeof value !== 'string') points.push(...value);
  const [x, y, z, radius] = sphereAround(points);
  return [x, y, z, radius * 2];
}

/** A ship's sphere (`shipSphere`) as it lies at `place`, measured from `eye`. */
export function sphereAt(
  sphere: readonly number[],
  place: ShipPlace,
  eye: readonly [number, number, number],
): [number, number, number, number] {
  const axes = shipAxes(place.heading, place.pitch, place.roll);
  const scale = place.scale ?? 1;
  const middle = [place.x, place.y, place.z].map(
    (along, axis) =>
      along -
      (eye[axis] ?? 0) +
      scale * axes.reduce((sum, column, part) => sum + (column[axis] ?? 0) * (sphere[part] ?? 0), 0),
  );
  return [middle[0] ?? 0, middle[1] ?? 0, middle[2] ?? 0, (sphere[3] ?? 0) * scale];
}

/** The ships' pictures each device holds for what draws with them beside the ships' own kit (a story's wreck), and
 *  how many hold them: one upload, let go once the last of them is. */
const SHARED_PICTURES = new WeakMap<GPUDevice, { readonly texture: GPUTexture; holders: number }>();

export function holdPictures(device: GPUDevice): GPUTexture {
  const held = SHARED_PICTURES.get(device) ?? { texture: picturesTexture(device), holders: 0 };
  held.holders += 1;
  SHARED_PICTURES.set(device, held);
  return held.texture;
}

export function releasePictures(device: GPUDevice): void {
  const held = SHARED_PICTURES.get(device);
  if (!held || --held.holders > 0) return;
  held.texture.destroy();
  SHARED_PICTURES.delete(device);
}

/** How many ships of one model are drawn in a frame: every ship a fleet room holds, its sixteen players' and four
 *  captains'. */
export const SHIP_SLOTS = 20;

/** Draws a ship's mesh at its place, lit as the land is, into the land's pass so the water sees it, each part in its
 *  picture, its side's paint on its shell, its yards braced with its square sails, and its sails' canvas and its
 *  flag as its rig sets them: one model, up to `slots` ships of it a frame, each with its own place and canvas. */
export class ShipView {
  private readonly gpu: Gpu;
  private readonly device: GPUDevice;
  private readonly kit: ShipKit;
  private readonly vertices: GPUBuffer;
  private readonly indices: GPUBuffer;
  /** Each slot's canvas as last laid: from which rig, as it and its harm had changed then, for which side (its
   *  flag's), and how many of its indices are drawn. A moored ship's furled rig never changes, so its canvas is laid
   *  once; a sailing one's once a frame for the shadows' passes and the picture alike. */
  private readonly laid: (
    | { rig: SailRig; changes: number; harm: ShipHarm; harmed: number; side: ShipLook['side']; indices: number }
    | undefined
  )[] = [];
  private readonly slots: {
    readonly uniforms: GPUBuffer;
    readonly bindGroup: GPUBindGroup;
    readonly canvas: GPUBuffer;
    readonly canvasIndices: GPUBuffer;
  }[];
  private readonly indexCount: number;
  /** Its waterline, for its footprint on the water and its wake. */
  readonly waterline: Waterline;
  /** Its sails' corners, for each ship's rig. */
  readonly sails: readonly SailCorners[];
  /** Its tallest mast's head, where its flag flies; where a side's paint goes on it (`hullPaint`); its yards. */
  private readonly masthead: readonly [number, number, number];
  private readonly paint: HullPaint;
  private readonly tags: ShipTags;
  private readonly flat: readonly Float32Array[];
  /** Its bounding sphere in its own frame, made once (`shipSphere`). */
  private readonly sphere: readonly number[];

  /** Opens a hull's view on the device, its mesh tagged (`tagShip`) and the device's kit made if it is not yet. */
  static async open(gpu: Gpu, mesh: ShipMesh, sails: readonly SailCorners[], paint: HullPaint, slots = SHIP_SLOTS) {
    return new ShipView(gpu, await shipKit(gpu), mesh, sails, paint, slots);
  }

  private constructor(
    gpu: Gpu,
    kit: ShipKit,
    mesh: ShipMesh,
    sails: readonly SailCorners[],
    paint: HullPaint,
    slots: number,
  ) {
    this.gpu = gpu;
    this.device = gpu.device;
    this.kit = kit;
    this.waterline = mesh.waterline;
    this.sails = sails;
    this.masthead = mastheadOf(mesh);
    this.paint = paint;
    this.tags = tagShip(mesh, sails);
    this.sphere = shipSphere(mesh, sails);
    if (this.tags.yards.length > MOST_YARDS) throw new Error(`a ship of ${this.tags.yards.length} yards is too many`);
    if (this.tags.masts.length > MOST_MASTS) throw new Error(`a ship of ${this.tags.masts.length} masts is too many`);
    this.flat = [flagFlat()];
    this.vertices = bufferOf(gpu.device, this.tags.vertices, BUFFER_USAGE.vertex);
    this.indices = bufferOf(gpu.device, mesh.indices, BUFFER_USAGE.index);
    this.indexCount = mesh.indices.length;
    // Its sails' grids, then its flag's: each slot's own, as each ship's holes are its own.
    const gridBytes = canvasIndices(sails.length + 1).byteLength;
    this.slots = Array.from({ length: slots }, () => {
      const uniforms = gpu.device.createBuffer({
        size: PLACE_FLOATS * 4,
        usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
      });
      const bindGroup = gpu.device.createBindGroup({
        layout: kit.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: kit.pictures },
          { binding: 2, resource: kit.sampler },
        ],
      });
      const canvas = gpu.device.createBuffer({
        size: (sails.length + 1) * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES,
        usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
      });
      const canvasIndices = gpu.device.createBuffer({
        size: gridBytes,
        usage: BUFFER_USAGE.index | BUFFER_USAGE.copyDestination,
      });
      return { uniforms, bindGroup, canvas, canvasIndices };
    });
  }

  /** Its bounds at `place` as a sphere measured from `eye` ([x, y, z, radius]), for every pass that leaves it out
   *  when out of sight; none while a part torn or fallen from its `rig` lies off its side or drifts astern of it,
   *  where no sphere of its own reaches. */
  boundsAt(
    place: ShipPlace,
    eye: readonly [number, number, number],
    rig: SailRig | null,
  ): [number, number, number, number] | null {
    if (rig) {
      const { harm, time } = rig;
      if (this.tags.masts.some((unused, mast) => harm.isFallen(mast))) return null;
      if (this.sails.some((unused, sail) => harm.sailLost(sail, time) !== null)) return null;
    }
    return sphereAt(this.sphere, place, eye);
  }

  /** Draws it into a pass the land's pipelines draw into (its formats, samples and reversed depth), in its own
   *  `slot` of the frame, in its side's colours as light as `look` says, and its yards, canvas and flag as `rig` sets
   *  them (none without a rig, its yards square), lit by the sun through `shadow`'s maps (none unless given). */
  drawInto(
    pass: GPURenderPassEncoder,
    place: ShipPlace,
    camera: ShipCamera,
    slot = 0,
    look: ShipLook = PLAYER_LOOK,
    rig: SailRig | null = null,
    shadow: ShadowMap = ShadowMap.none(this.gpu),
  ): void {
    const canvas = this.prepare(place, camera, slot, look, rig);
    if (canvas !== null) this.encode(pass, slot, canvas, this.kit.pipeline, shadow.receiverGroup(this.kit.pipeline));
  }

  /** Draws its shadow, as `drawInto` would draw it (in its `look`, as the picture lays its canvas), into the cascade
   *  of the sun's map `shadow` is drawing. */
  castInto(
    pass: GPURenderPassEncoder,
    place: ShipPlace,
    camera: ShipCamera,
    slot: number,
    rig: SailRig | null,
    shadow: ShadowMap,
    look: ShipLook = PLAYER_LOOK,
  ): void {
    const canvas = this.prepare(place, camera, slot, look, rig);
    if (canvas !== null) this.encode(pass, slot, canvas, this.kit.cast, shadow.casterGroup(this.kit.cast));
  }

  /** Writes its slot's uniforms and canvas for a frame; answers how many of its canvas's indices are drawn, or null
   *  for a slot it has not. */
  private prepare(
    place: ShipPlace,
    camera: ShipCamera,
    slot: number,
    look: ShipLook,
    rig: SailRig | null,
  ): number | null {
    const drawn = this.slots[slot];
    if (!drawn) return null;
    if (rig && rig.sails.length !== this.sails.length)
      throw new Error(`a rig of ${rig.sails.length} sails is not this ship's`);
    const values = new Float32Array(PLACE_FLOATS);
    values.set(camera.fromEye);
    const turn = shipTurn(place.heading, place.pitch, place.roll);
    // A ship drawn larger than life: its frame's three axes stretched alike (the shader renormalises its normals).
    for (let index = 0; index < 12; index++) turn[index] = (turn[index] ?? 0) * (place.scale ?? 1);
    values.set(turn, 16);
    values.set([place.x - camera.eye[0], place.y - camera.eye[1], place.z - camera.eye[2], 0], 32);
    values.set([look.shade ?? 1, 0, 0, 0], 36);
    const dress = DRESSES[look.side];
    [dress.hull, dress.stripe, dress.canvas].forEach((colour, index) =>
      values.set(colour ? [...colour, 1] : [0, 0, 0, 0], 40 + index * 4),
    );
    values.set([this.paint.atM, this.paint.rise, STRIPE_HALF_M, 0], 52);
    this.tags.yards.forEach((yard, index) => {
      const brace = ((rig?.sails[yard.sail]?.trimDeg ?? 0) * Math.PI) / 180;
      values.set([yard.pivot[0], yard.pivot[1], Math.cos(brace), Math.sin(brace)], YARD_FLOATS_AT + index * 4);
    });
    const now = rig?.time ?? 0;
    if (rig) values.set(mastFalls(rig.harm, this.tags.masts, now), MAST_FLOATS_AT);
    else for (let mast = 0; mast < MOST_MASTS; mast++) values.set([0, 1, 0, 1], MAST_FLOATS_AT + mast * 8);
    this.device.queue.writeBuffer(drawn.uniforms, 0, values);
    if (!rig) return 0;
    const laid = this.laid[slot];
    const { changes, harm } = rig;
    if (
      laid?.rig === rig &&
      laid.changes === changes &&
      laid.harm === harm &&
      laid.harmed === harm.changes &&
      laid.side === look.side
    )
      return laid.indices;
    const flown = flagAt(this.masthead, rig.harm, this.tags.masts, now);
    const flag = flagGrid(flown.at, this.waterline.lengthM, rig.offDeg, rig.time);
    const flagLayer = SHIP_PARTS.length + SHIP_SIDES.indexOf(look.side);
    const sails = harmedCanvas(rig.canvas(this.tags.pivots), rig.harm, this.tags.masts, this.waterline.beamM / 2, now);
    const grid = canvasIndices(this.sails.length + 1, (sail, cell) =>
      sail < this.sails.length ? cellShows(rig.harm, sail, cell, now) : flown.shows,
    );
    this.laid[slot] = { rig, changes, harm, harmed: harm.changes, side: look.side, indices: grid.length };
    if (grid.length === 0) return 0;
    this.device.queue.writeBuffer(drawn.canvasIndices, 0, grid);
    this.device.queue.writeBuffer(
      drawn.canvas,
      0,
      canvasVertices(
        [...sails, flag],
        [...rig.sails.map((sail) => sail.flat), ...this.flat],
        [...rig.sails.map(() => SHIP_PARTS.indexOf('sail')), flagLayer],
      ),
    );
    return grid.length;
  }

  /** Its hull, then `canvas` indices of its canvas, through `pipeline` with its group 1. */
  private encode(
    pass: GPURenderPassEncoder,
    slot: number,
    canvas: number,
    pipeline: GPURenderPipeline,
    group: GPUBindGroup,
  ): void {
    const drawn = this.slots[slot];
    if (!drawn) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, drawn.bindGroup);
    pass.setBindGroup(1, group);
    // The sky lights what is drawn; a shadow's cast needs none of it.
    if (pipeline === this.kit.pipeline) skyUniformFor(this.device).bindShared(pass, [2]);
    pass.setVertexBuffer(0, this.vertices);
    pass.setIndexBuffer(this.indices, 'uint32');
    pass.drawIndexed(this.indexCount);
    if (canvas === 0) return;
    pass.setVertexBuffer(0, drawn.canvas);
    pass.setIndexBuffer(drawn.canvasIndices, 'uint32');
    pass.drawIndexed(canvas);
  }

  /** Lets go of its buffers on the GPU; it is never drawn again. */
  destroy(): void {
    for (const buffer of [this.vertices, this.indices]) buffer.destroy();
    for (const slot of this.slots)
      for (const buffer of [slot.uniforms, slot.canvas, slot.canvasIndices]) buffer.destroy();
  }
}
