import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { levelsOf } from '../textures/levels.ts';
import type { Picture } from '../textures/picture.ts';
import { SHIP_PARTS, SHIP_PICTURE_TEXELS, shipPictures } from '../textures/shipPictures.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { DRESSES, PLAYER_LOOK, SHIP_SIDES, type ShipLook } from './dress.ts';
import { flagFlat, flagGrid } from './flag.ts';
import { flagPictures } from './flagPictures.ts';
import type { HullPaint } from './hulls.ts';
import { SAIL_COLUMNS, SAIL_ROWS, type SailCorners, type SailRig } from './sails.ts';
import { shipAxes } from './shipAxes.ts';
import { type ShipMesh, VERTEX_BYTES, type Waterline } from './shipMesh.ts';

/** Where a ship is drawn: her middle in window metres (her height as drawn), her heading (radians clockwise from
 *  north), her bow's rise and her heel to starboard (radians), and how many times her size (1 unless said). */
export interface ShipPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly scale?: number;
}

/** The camera she is drawn from: its matrix from the eye, and the eye in window metres as drawn. */
export interface ShipCamera {
  readonly fromEye: Float32Array;
  readonly eye: readonly [number, number, number];
}

/** Her faces seen from outside reach the screen counter-clockwise, as the land's and the water's do: the export keeps
 *  each face's corners in the model's own order, and the world (east, south, up) is mirrored as her frame is. */
export const FRONT_FACE: GPUFrontFace = 'ccw';

/** The matrix (column-major, 4 × 4) that turns her own frame (x to her bow, y to starboard, z up) into the world's
 *  (east, south, up): her roll, then her pitch, then her heading. */
export function shipTurn(heading: number, pitch: number, roll: number): Float32Array<ArrayBuffer> {
  const turn = new Float32Array(16);
  shipAxes(heading, pitch, roll).forEach((column, index) => turn.set(column, index * 4));
  turn[15] = 1;
  return turn;
}

/** A part's picture repeats at this many texels a metre over her, as a forged model's do. */
const TEXELS_PER_METRE = 40;

/** Her stripe stands this far either side of the line of her upper gunports, metres. */
export const STRIPE_HALF_M = 0.3;

/** The shader, its parts' pictures' mean lightness given: a side's paint keeps a picture's grain about its colour. */
const shipShader = (hullLight: number, sailLight: number) => /* wgsl */ `
${SHARED_WGSL}
const AMBIENT = 0.35;
const HULL_LIGHT = ${hullLight.toFixed(4)};
const SAIL_LIGHT = ${sailLight.toFixed(4)};
const LIGHTNESS = vec3f(0.299, 0.587, 0.114);
// Her UVs are metres; a picture repeats every SHIP_PICTURE_TEXELS / TEXELS_PER_METRE of them, standing upright.
const PICTURE_PER_M = vec2f(${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS}, -${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS});

struct Place {
  from_eye: mat4x4f,
  turn: mat4x4f,
  // Her middle from the eye, metres as drawn.
  offset: vec4f,
  // How light she is drawn: 1 as modelled, less for a darker ship.
  shade: vec4f,
  // Her side's paint for her hull, her stripe and her canvas, each its colour and 1 where it is laid, 0 where not.
  hull: vec4f,
  stripe: vec4f,
  canvas: vec4f,
  // Her stripe's line in her frame: its height at her middle, its rise a metre toward her bow, and its half height.
  band: vec4f,
  // Her shell in her frame: her hull's middle along her, its half length and its half beam.
  shell: vec4f,
};

@group(0) @binding(0) var<uniform> place: Place;
@group(0) @binding(1) var pictures: texture_2d_array<f32>;
@group(0) @binding(2) var pictured: sampler;

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) part: u32,
  // Where on her it is and which way it faces, in her own frame.
  @location(3) model: vec3f,
  @location(4) facing: vec3f,
};

@vertex
fn vertex_main(
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) uv: vec2f,
  @location(3) part: vec4u,
) -> Drawn {
  var drawn: Drawn;
  let world = (place.turn * vec4f(position, 0.0)).xyz + place.offset.xyz;
  drawn.clip = place.from_eye * vec4f(world, 1.0);
  drawn.normal = (place.turn * vec4f(normal.xyz, 0.0)).xyz;
  drawn.uv = uv * PICTURE_PER_M;
  drawn.part = part.x;
  drawn.model = position;
  drawn.facing = normal.xyz;
  return drawn;
}

@fragment
fn fragment_main(drawn: Drawn, @builtin(front_facing) facing: bool) -> @location(0) vec4f {
  // Sails and planks are single faces seen from both sides: the side seen is lit.
  let normal = normalize(select(-drawn.normal, drawn.normal, facing));
  var colour = textureSample(pictures, pictured, drawn.uv, drawn.part).rgb;
  let light = dot(colour, LIGHTNESS);
  // A side paints her shell's outside and all of her under her waterline; her deck's fittings, the insides of her
  // bulwarks and whatever stands inboard keep their timber.
  let across = vec2f((drawn.model.x - place.shell.x) / place.shell.y, drawn.model.y / place.shell.z);
  let outside = dot(drawn.facing.xy, across) > 0.0 && dot(across, across) > 0.5;
  if (drawn.part == 0u && (outside || drawn.model.z < 0.3)) {
    let line = place.band.x + place.band.y * drawn.model.x;
    if (place.stripe.w > 0.0 && abs(drawn.model.z - line) < place.band.z) {
      colour = place.stripe.rgb * clamp(light / HULL_LIGHT, 0.7, 1.3);
    } else if (place.hull.w > 0.0) {
      colour = place.hull.rgb * clamp(light / HULL_LIGHT, 0.6, 1.4);
    }
  } else if (drawn.part == 3u && place.canvas.w > 0.0) {
    colour = place.canvas.rgb * clamp(light / SAIL_LIGHT, 0.75, 1.15);
  }
  return vec4f(colour * place.shade.x * (AMBIENT + (1.0 - AMBIENT) * max(dot(normal, SUN), 0.0)), 1.0);
}
`;

/** A canvas's grid as triangles, two a cell, each sail's after the last's. */
function canvasIndices(sails: number): Uint32Array<ArrayBuffer> {
  const corners: number[] = [];
  for (let sail = 0; sail < sails; sail++)
    for (let row = 0; row < SAIL_ROWS - 1; row++)
      for (let column = 0; column < SAIL_COLUMNS - 1; column++) {
        const first = sail * SAIL_COLUMNS * SAIL_ROWS + row * SAIL_COLUMNS + column;
        const [right, up] = [first + 1, first + SAIL_COLUMNS];
        corners.push(first, right, up + 1, first, up + 1, up);
      }
  return new Uint32Array(corners);
}

/** The canvas's vertices, as her mesh's are, from each sail's grid now: a point's normal across its neighbours (the
 *  side its triangles face on the screen, as the export keeps hers), its UV the metres of its sail laid flat, its
 *  picture the sail's but where `layers` names another (her flag's). */
export function canvasVertices(
  canvas: readonly Float32Array[],
  flat: readonly Float32Array[],
  layers: readonly number[] = [],
): ArrayBuffer {
  const bytes = new ArrayBuffer(canvas.length * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES);
  const view = new DataView(bytes);
  const sailPart = SHIP_PARTS.indexOf('sail');
  canvas.forEach((points, sail) => {
    const pointAt = (column: number, row: number, axis: number): number =>
      points[
        (Math.min(SAIL_ROWS - 1, Math.max(0, row)) * SAIL_COLUMNS + Math.min(SAIL_COLUMNS - 1, Math.max(0, column))) *
          3 +
          axis
      ] ?? 0;
    for (let row = 0; row < SAIL_ROWS; row++)
      for (let column = 0; column < SAIL_COLUMNS; column++) {
        const along = [0, 1, 2].map((axis) => pointAt(column + 1, row, axis) - pointAt(column - 1, row, axis));
        const up = [0, 1, 2].map((axis) => pointAt(column, row + 1, axis) - pointAt(column, row - 1, axis));
        const [alongX, alongY, alongZ] = along as [number, number, number];
        const [upX, upY, upZ] = up as [number, number, number];
        // The mirrored frame: a face's front is where (up × along) points, as her export's normals are.
        const normal = [upY * alongZ - upZ * alongY, upZ * alongX - upX * alongZ, upX * alongY - upY * alongX];
        const length = Math.hypot(...normal) || 1;
        const byte = ((sail * SAIL_ROWS + row) * SAIL_COLUMNS + column) * VERTEX_BYTES;
        const grid = (row * SAIL_COLUMNS + column) * 3;
        for (let axis = 0; axis < 3; axis++) {
          view.setFloat32(byte + axis * 4, points[grid + axis] ?? 0, true);
          view.setInt8(byte + 12 + axis, Math.round(((normal[axis] ?? 0) / length) * 127));
        }
        const laid = flat[sail];
        view.setFloat32(byte + 16, laid?.[grid] ?? 0, true);
        view.setFloat32(byte + 20, laid?.[grid + 2] ?? 0, true);
        view.setUint8(byte + 24, layers[sail] ?? sailPart);
      }
  });
  return bytes;
}

let painted: Picture[] | null = null;
/** Her parts' pictures, a layer a part in `SHIP_PARTS`' order, then a flag a side in `SHIP_SIDES`': painted once. */
function pictures(): Picture[] {
  painted ??= [...shipPictures(), ...flagPictures()];
  return painted;
}

/** A picture's mean lightness, 0 to 1. */
function lightnessOf(picture: Picture | undefined): number {
  if (!picture) throw new Error("a ship's part has no picture");
  let sum = 0;
  for (let texel = 0; texel < picture.rgba.length; texel += 4)
    sum +=
      0.299 * (picture.rgba[texel] ?? 0) +
      0.587 * (picture.rgba[texel + 1] ?? 0) +
      0.114 * (picture.rgba[texel + 2] ?? 0);
  return Math.max(0.05, sum / (picture.rgba.length / 4) / 255);
}

/** Where her tallest mast's head is, in her frame: the highest point of her spars. */
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

/** Her parts' pictures and the sides' flags on the GPU: a layer each, with every level. */
function picturesTexture(device: GPUDevice): GPUTexture {
  const side = SHIP_PICTURE_TEXELS;
  const levels = Math.log2(side) + 1;
  const texture = device.createTexture({
    size: [side, side, pictures().length],
    format: 'rgba8unorm',
    mipLevelCount: levels,
    usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
  });
  pictures().forEach((picture, layer) => {
    if (picture.width !== side || picture.height !== side) throw new Error(`a ship's picture is not ${side} square`);
    levelsOf(picture.rgba, side).forEach((level, mipLevel) => {
      const width = side >> mipLevel;
      device.queue.writeTexture({ texture, mipLevel, origin: [0, 0, layer] }, level, { bytesPerRow: width * 4 }, [
        width,
        width,
        1,
      ]);
    });
  });
  return texture;
}

/** How many ships of one model are drawn in a frame: every ship a fleet room holds, its sixteen players' and four
 *  captains'. */
export const SHIP_SLOTS = 20;
const PLACE_FLOATS = 60;

/** Draws a ship's mesh at her place, lit as the land is, into the land's pass so the water sees her, each part in its
 *  picture, and her sails' canvas as her rig sets it: one model, up to `slots` ships of it a frame, each with her own
 *  place and canvas. */
export class ShipView {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly vertices: GPUBuffer;
  private readonly indices: GPUBuffer;
  private readonly slots: {
    readonly uniforms: GPUBuffer;
    readonly bindGroup: GPUBindGroup;
    readonly canvas: GPUBuffer;
  }[];
  private readonly indexCount: number;
  private readonly canvasIndices: GPUBuffer;
  private readonly canvasIndexCount: number;
  /** Her waterline, for her footprint on the water and her wake. */
  readonly waterline: Waterline;
  /** Her sails' corners, for each ship's rig. */
  readonly sails: readonly SailCorners[];
  /** Her tallest mast's head, where her flag flies, and where a side's paint goes on her (`hullPaint`). */
  private readonly masthead: readonly [number, number, number];
  private readonly paint: HullPaint;
  private readonly flat: readonly Float32Array[];

  constructor(
    gpu: Gpu,
    mesh: ShipMesh,
    sails: readonly SailCorners[],
    slots = SHIP_SLOTS,
    paint: HullPaint = { atM: 0, rise: 0, middleM: 0, halfLengthM: 1, halfBeamM: 1 },
  ) {
    this.device = gpu.device;
    this.waterline = mesh.waterline;
    this.sails = sails;
    this.masthead = mastheadOf(mesh);
    this.paint = paint;
    this.flat = [flagFlat()];
    const [hullLight, sailLight] = [0, 3].map((layer) => lightnessOf(pictures()[layer])) as [number, number];
    const module = gpu.device.createShaderModule({ code: shipShader(hullLight, sailLight) });
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertex_main',
        buffers: [
          {
            arrayStride: VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x2' },
              { shaderLocation: 3, offset: 24, format: 'uint8x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list', frontFace: FRONT_FACE },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: SAMPLES },
    });
    this.vertices = gpu.device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    gpu.device.queue.writeBuffer(this.vertices, 0, mesh.vertices);
    this.indices = gpu.device.createBuffer({
      size: mesh.indices.byteLength,
      usage: BUFFER_USAGE.index | BUFFER_USAGE.copyDestination,
    });
    gpu.device.queue.writeBuffer(this.indices, 0, mesh.indices);
    this.indexCount = mesh.indices.length;
    // Her sails' grids, then her flag's.
    const grid = canvasIndices(sails.length + 1);
    this.canvasIndexCount = grid.length;
    this.canvasIndices = gpu.device.createBuffer({
      size: grid.byteLength,
      usage: BUFFER_USAGE.index | BUFFER_USAGE.copyDestination,
    });
    gpu.device.queue.writeBuffer(this.canvasIndices, 0, grid);
    const pictured = picturesTexture(gpu.device).createView({ dimension: '2d-array' });
    const sampler = gpu.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'nearest',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    this.slots = Array.from({ length: slots }, () => {
      const uniforms = gpu.device.createBuffer({
        size: PLACE_FLOATS * 4,
        usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
      });
      const bindGroup = gpu.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: pictured },
          { binding: 2, resource: sampler },
        ],
      });
      const canvas = gpu.device.createBuffer({
        size: (sails.length + 1) * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES,
        usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
      });
      return { uniforms, bindGroup, canvas };
    });
  }

  /** Draws her into a pass the land's pipelines draw into (its formats, samples and reversed depth), in her own
   *  `slot` of the frame, in her side's colours as light as `look` says, and her canvas and flag as `rig` sets them
   *  (none without a rig). */
  drawInto(
    pass: GPURenderPassEncoder,
    place: ShipPlace,
    camera: ShipCamera,
    slot = 0,
    look: ShipLook = PLAYER_LOOK,
    rig: SailRig | null = null,
  ): void {
    const drawn = this.slots[slot];
    if (!drawn) return;
    const values = new Float32Array(PLACE_FLOATS);
    values.set(camera.fromEye);
    const turn = shipTurn(place.heading, place.pitch, place.roll);
    // A ship drawn larger than life: her frame's three axes stretched alike (the shader renormalises her normals).
    for (let index = 0; index < 12; index++) turn[index] = (turn[index] ?? 0) * (place.scale ?? 1);
    values.set(turn, 16);
    values.set([place.x - camera.eye[0], place.y - camera.eye[1], place.z - camera.eye[2], 0], 32);
    values.set([look.shade ?? 1, 0, 0, 0], 36);
    const dress = DRESSES[look.side];
    [dress.hull, dress.stripe, dress.canvas].forEach((colour, index) =>
      values.set(colour ? [...colour, 1] : [0, 0, 0, 0], 40 + index * 4),
    );
    const { atM, rise, middleM, halfLengthM, halfBeamM } = this.paint;
    values.set([atM, rise, STRIPE_HALF_M, 0, middleM, halfLengthM, halfBeamM, 0], 52);
    this.device.queue.writeBuffer(drawn.uniforms, 0, values);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, drawn.bindGroup);
    pass.setVertexBuffer(0, this.vertices);
    pass.setIndexBuffer(this.indices, 'uint32');
    pass.drawIndexed(this.indexCount);
    if (!rig) return;
    if (rig.sails.length !== this.sails.length)
      throw new Error(`a rig of ${rig.sails.length} sails is not this ship's`);
    const flag = flagGrid(this.masthead, this.waterline.lengthM, rig.offDeg, rig.time);
    const flagLayer = SHIP_PARTS.length + SHIP_SIDES.indexOf(look.side);
    this.device.queue.writeBuffer(
      drawn.canvas,
      0,
      canvasVertices(
        [...rig.canvas(), flag],
        [...rig.sails.map((sail) => sail.flat), ...this.flat],
        [...rig.sails.map(() => SHIP_PARTS.indexOf('sail')), flagLayer],
      ),
    );
    pass.setVertexBuffer(0, drawn.canvas);
    pass.setIndexBuffer(this.canvasIndices, 'uint32');
    pass.drawIndexed(this.canvasIndexCount);
  }
}
