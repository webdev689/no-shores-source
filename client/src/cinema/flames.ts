// Fires that burn, smoke and throw embers. A fire's parts are worked out on the CPU from its seed and the clock once a
// frame of its flicker (flameParts.ts), so a fire looks the same every time it is drawn, then laid over the finished
// picture after the water, its glows under its flames lighting what stands round it.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { FLAMES_WGSL, GLOW_GAIN, NOISE_SEEDS, PART, PART_KINDS } from './flamesShader.ts';
import { inverted } from './inverted.ts';
import { FIRELIGHT, type LampPlace } from '../sky/lamps.ts';
import {
  FIRE_TEXELS_PER_METRE,
  type Fire,
  fireFrame,
  fireGlows,
  fireParts,
  type Point,
  type Wind,
} from './flameParts.ts';

/** Floats a part takes: where it stands from the eye and its kind, its shape and lean, its colour and strength. */
const PART_FLOATS = 12;
/** The light at a fire's middle, red and orange: added to what it lights it warms it, and where that already stands
 *  at full red it goes no further than yellow-orange. */
export const GLOW_COLOUR = [0.6, 0.3, 0.03] as const;

/** `colour` (0 to 1 a channel) as a fire's light leaves it, the fire of `strength` and the point `near` of its reach
 *  from its middle: its light added, falling off softly to none at its reach. As `glow_fragment` adds it. */
export function fireLit(colour: readonly number[], strength: number, near: number): number[] {
  const fall = (1 - Math.min(1, Math.max(0, near))) ** 2;
  return colour.map((value, channel) => Math.min(1, value + (GLOW_COLOUR[channel] ?? 0) * strength * GLOW_GAIN * fall));
}
/** The most parts drawn in a frame: forty large fires, some burning along edges, fit well inside it. */
export const MOST_PARTS = 16_384;
const PREMULTIPLIED = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;

/** How far a fire's tongues read, metres a metre of its height, and never nearer than the least: past it, a fire is its
 *  glow alone, flickering with its light. */
export const TONGUES_READ_M = { perSize: 120, least: 12 } as const;
/** How far a fire's light reaches, metres a metre of its height, and never less than the least. */
const LAMP_REACH_M = { perSize: 8, least: 4 } as const;

/** Whether `fire` stands past where its tongues read from `eye`. */
export function farFire(fire: Fire, eye: Point): boolean {
  const reads = Math.max(TONGUES_READ_M.least, TONGUES_READ_M.perSize * fire.sizeM);
  return Math.hypot(fire.at[0] - eye[0], fire.at[1] - eye[1], fire.at[2] - eye[2]) > reads;
}

/** A fire's parts in one frame of its flicker, packed as instances in world metres: what it shows, then its glows. */
interface Packed {
  readonly frame: number;
  readonly far: boolean;
  readonly shown: Float64Array;
  readonly glows: Float64Array;
}
const packedOf = new WeakMap<Fire, Packed>();

/** The fire's packed parts at `time`, worked out again only when its frame turns or it comes near or goes `far`; a
 *  change in the wind is taken up then. Far, it is its glows alone. Its tongues go after its smoke, the core one last,
 *  so the brightest flame stands over the rest. Each part carries its kind and a noise seed of its own from the
 *  fire's, so its licks and edges never hang on its slot. */
function packedFire(fire: Fire, time: number, wind: Wind, far: boolean): Packed {
  const frame = fireFrame(fire, time);
  const known = packedOf.get(fire);
  if (known?.frame === frame && known.far === far) return known;
  const parts = far
    ? { smoke: [], wisps: [], tongues: [], embers: [], held: 0, glows: fireGlows(fire, time) }
    : fireParts(fire, time, wind);
  const shown: number[] = [];
  const glows: number[] = [];
  let part = 0;
  const add = (into: number[], place: Point, kind: number, ...rest: number[]) =>
    into.push(...place, kind + PART_KINDS * (Math.abs(Math.trunc(fire.seed) * 131 + part++) % NOISE_SEEDS), ...rest);
  for (const puff of parts.smoke)
    add(shown, puff.position, PART.smoke, puff.radius, 0, 0, 0, puff.age, puff.warmth, puff.opacity, puff.radius);
  for (const wisp of parts.wisps)
    add(shown, wisp.position, PART.wisp, wisp.radius, 0, 0, 0, wisp.heat, parts.held, 0, wisp.radius);
  for (const tongue of parts.tongues.toReversed())
    add(shown, tongue.position, PART.tongue, tongue.width, tongue.height, ...tongue.lean, parts.held, 0, 0, 1);
  for (const ember of parts.embers)
    add(
      shown,
      ember.position,
      PART.ember,
      ember.texels / 2 / FIRE_TEXELS_PER_METRE,
      0,
      0,
      0,
      0,
      0,
      0,
      ember.brightness,
    );
  for (const glow of parts.glows)
    add(glows, glow.position, PART.glow, glow.reach, 0, 0, 0, ...GLOW_COLOUR, glow.strength);
  const packed = { frame, far, shown: Float64Array.from(shown), glows: Float64Array.from(glows) };
  packedOf.set(fire, packed);
  return packed;
}

/** The fires' parts at `time`, each as `PART_FLOATS` floats measured from `eye`, into `into` from its start: every
 *  fire's smoke, wisps, flames and embers, then every glow, a fire past where its tongues read its glow alone. Gives
 *  how many of each were written; past the buffer's room, parts are left out before any glow is. */
export function packFires(
  fires: Iterable<Fire>,
  time: number,
  wind: Wind,
  eye: Point,
  into: Float32Array,
): { shown: number; glows: number } {
  const most = Math.floor(into.length / PART_FLOATS);
  const all = Array.from(fires, (fire) => packedFire(fire, time, wind, farFire(fire, eye)));
  const glows = Math.min(
    most,
    all.reduce((sum, packed) => sum + packed.glows.length / PART_FLOATS, 0),
  );
  let slot = 0;
  const copy = (from: Float64Array, room: number) => {
    for (let start = 0; start < from.length && slot < room; start += PART_FLOATS, slot++) {
      const offset = slot * PART_FLOATS;
      into[offset] = (from[start] ?? 0) - eye[0];
      into[offset + 1] = (from[start + 1] ?? 0) - eye[1];
      into[offset + 2] = (from[start + 2] ?? 0) - eye[2];
      into.set(from.subarray(start + 3, start + PART_FLOATS), offset + 3);
    }
  };
  for (const packed of all) copy(packed.shown, most - glows);
  const shown = slot;
  for (const packed of all) copy(packed.glows, most);
  return { shown, glows: slot - shown };
}

/** Fires, lit and put out by id, drawn as one of the scene's drawers over the water. */
export class Flames {
  /** The wind the smoke leans with, m/s east and south. */
  wind: Wind = [0, 0];
  /** How far through what stands nearer its flames still show, metres: a lantern's glass round its flame. */
  seeThroughM = 0;
  private readonly device: GPUDevice;
  private readonly module: GPUShaderModule;
  private readonly overLayout: GPUBindGroupLayout;
  private readonly overPipeline: GPURenderPipeline;
  private readonly glowPipeline: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private bound: { depth: GPUTexture; group: GPUBindGroup } | null = null;
  private readonly fires = new Map<number, Fire>();
  private nextId = 1;
  private instances: GPUBuffer | null = null;
  private readonly values = new Float32Array(MOST_PARTS * PART_FLOATS);
  private counts = { shown: 0, glows: 0 };
  private lit: LampPlace[] | null = null;

  constructor(gpu: Gpu) {
    const { device } = gpu;
    this.device = device;
    this.module = device.createShaderModule({ code: FLAMES_WGSL });
    const uniform = { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} };
    this.overLayout = device.createBindGroupLayout({
      entries: [
        uniform,
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const vertex: GPUVertexState = {
      module: this.module,
      entryPoint: 'part_vertex',
      buffers: [
        {
          arrayStride: PART_FLOATS * 4,
          stepMode: 'instance',
          attributes: [0, 1, 2].map((location) => ({
            shaderLocation: location,
            offset: location * 16,
            format: 'float32x4' as const,
          })),
        },
      ],
    };
    this.overPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.overLayout] }),
      vertex,
      fragment: {
        module: this.module,
        entryPoint: 'over_fragment',
        targets: [{ format: gpu.format, blend: { color: PREMULTIPLIED, alpha: PREMULTIPLIED } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    // Its glows under its flames, at the picture's own size, so their light falls off softly rather than in the light
    // layer's steps.
    this.glowPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.overLayout] }),
      vertex,
      fragment: {
        module: this.module,
        entryPoint: 'glow_fragment',
        targets: [{ format: gpu.format, blend: { color: PREMULTIPLIED, alpha: PREMULTIPLIED } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    this.view = device.createBuffer({ size: 144, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
  }

  /** Lights a fire `sizeM` tall (half a metre to four) with its base at `base` (world metres); gives its id. With
   *  `along`, the run in metres of an edge burning from `base` (a rail, a spar), it burns all along that edge. */
  light(base: Point, sizeM: number, seed: number, along?: Point): number {
    const id = this.nextId++;
    this.fires.set(id, along ? { at: base, sizeM, seed, along } : { at: base, sizeM, seed });
    this.lit = null;
    return id;
  }

  /** Puts every fire out. */
  clear(): void {
    this.fires.clear();
    this.lit = null;
  }

  /** How many fires burn. */
  get count(): number {
    return this.fires.size;
  }

  /** The light each fire casts, as the sky's lamps take it: at its glow, reaching with its size, in fire's colour,
   *  seeded as its flames are so it flickers with them. */
  get lamps(): readonly LampPlace[] {
    this.lit ??= [...this.fires.values()].map((fire) => ({
      at: fireGlows(fire, 0)[0]?.position ?? fire.at,
      reachM: Math.max(LAMP_REACH_M.least, LAMP_REACH_M.perSize * fire.sizeM),
      light: FIRELIGHT,
      seed: fire.seed,
    }));
    return this.lit;
  }

  /** Lets go of the fires' buffers on the GPU; with no fire left, nothing is drawn again. */
  destroy(): void {
    this.fires.clear();
    this.lit = null;
    this.view.destroy();
    this.instances?.destroy();
    this.instances = null;
    this.bound = null;
  }

  /** Works out the fires' parts at `time`, measured from the eye of `shot`; they are drawn over the water. */
  drawInto(_pass: GPURenderPassEncoder, fromEye: Float32Array, shot: { readonly eye: Point }, time: number): void {
    this.counts = packFires(this.fires.values(), time, this.wind, shot.eye, this.values);
    if (this.counts.shown + this.counts.glows === 0) return;
    const used = this.values.subarray(0, (this.counts.shown + this.counts.glows) * PART_FLOATS);
    this.instances ??= this.device.createBuffer({
      size: this.values.byteLength,
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    this.device.queue.writeBuffer(this.instances, 0, used);
    const toEye = inverted(fromEye) ?? new Float32Array(16);
    this.device.queue.writeBuffer(
      this.view,
      0,
      Float32Array.from([...fromEye.subarray(0, 16), ...toEye, time, this.seeThroughM, 0, 0]),
    );
  }

  /** The smoke, flames and embers over the finished picture `target`, hidden where the scene's `depth` (one float a
   *  pixel, reversed) stands nearer. */
  overWater(encoder: GPUCommandEncoder, target: GPUTextureView, _fromEye: Float32Array, depth: GPUTexture): void {
    if (!this.instances || this.counts.shown + this.counts.glows === 0) return;
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setBindGroup(0, this.groupFor(depth));
    pass.setVertexBuffer(0, this.instances);
    if (this.counts.glows > 0) {
      pass.setPipeline(this.glowPipeline);
      pass.draw(6, this.counts.glows, 0, this.counts.shown);
    }
    if (this.counts.shown > 0) {
      pass.setPipeline(this.overPipeline);
      pass.draw(6, this.counts.shown);
    }
    pass.end();
  }

  /** The view and the scene's `depth` (one float a pixel, reversed), bound once for each depth texture. */
  private groupFor(depth: GPUTexture): GPUBindGroup {
    if (this.bound?.depth !== depth) {
      const group = this.device.createBindGroup({
        layout: this.overLayout,
        entries: [
          { binding: 0, resource: { buffer: this.view } },
          { binding: 1, resource: depth.createView() },
        ],
      });
      this.bound = { depth, group };
    }
    return this.bound.group;
  }
}
