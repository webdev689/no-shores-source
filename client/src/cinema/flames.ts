// Fires that burn, smoke and throw embers. Each frame's parts are worked out on the CPU from the fire's seed and the
// clock, so a fire looks the same every time it is drawn, then laid over the finished picture after the water and
// drawn again into the light layer, where it lights what stands round it.
import { LIGHT_DEPTH, LIGHT_TARGET } from '../combat/lightLayer.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { FLAMES_WGSL, PART } from './flamesShader.ts';
import { inverted } from './inverted.ts';
import { hashUnit, smoothNoise } from './seeded.ts';

type Point = readonly [number, number, number];
type Wind = readonly [number, number];

/** A fire: where its base burns (world metres), how tall its tallest flame stands, and its seed. */
export interface Fire {
  readonly at: Point;
  readonly sizeM: number;
  readonly seed: number;
}

/** A fire at one moment: its tongues of flame, its smoke and its embers, each in world metres. */
export interface FireParts {
  readonly tongues: readonly { position: Point; height: number; width: number; lean: Wind }[];
  readonly smoke: readonly { position: Point; radius: number; age: number; opacity: number }[];
  readonly embers: readonly { position: Point; brightness: number }[];
}

const TONGUES = 5;
const PUFFS = 12;
const EMBERS = 10;
const SMOKE_LIFE_S = 4;
const EMBER_LIFE_S = 1.8;

/** The fire's parts at `seconds` in a `wind` (m/s east and south). The flames wander in height within a band and
 *  lean a little downwind; the smoke rises, grows, thins and leans further; the embers fly up and burn out. */
export function fireParts(fire: Fire, seconds: number, wind: Wind): FireParts {
  const { at, sizeM: size, seed } = fire;
  const lot = (salt: number) => hashUnit(seed * 7_919 + salt);
  const rise = 0.6 + 0.9 * Math.sqrt(size);
  const tongues = Array.from({ length: TONGUES }, (_slot, index) => {
    const angle = lot(index) * Math.PI * 2;
    const out = index === 0 ? 0 : size * 0.22 * lot(index + 10);
    const flicker = smoothNoise(seed * 13 + index, seconds * 3.2 + lot(index + 20) * 50);
    return {
      position: [at[0] + Math.cos(angle) * out, at[1] + Math.sin(angle) * out, at[2]] as Point,
      height: size * (0.55 + 0.45 * flicker) * (index === 0 ? 1 : 0.75),
      width: size * (index === 0 ? 0.32 : 0.22),
      lean: [wind[0] * 0.04, wind[1] * 0.04] as Wind,
    };
  });
  const smoke = Array.from({ length: PUFFS }, (_slot, index) => {
    const age = (seconds / SMOKE_LIFE_S + index / PUFFS + lot(index + 40)) % 1;
    const aloft = age * SMOKE_LIFE_S;
    const swirl = size * 0.3 * Math.sin(aloft * 1.7 + index);
    return {
      position: [
        at[0] + wind[0] * aloft * 0.7 + swirl,
        at[1] + wind[1] * aloft * 0.7 + swirl * 0.6,
        at[2] + size * 0.8 + aloft * rise,
      ] as Point,
      radius: size * (0.35 + 1.6 * age),
      age,
      opacity: 0.55 * Math.min(1, age * 6) * (1 - age),
    };
  });
  const embers = Array.from({ length: EMBERS }, (_slot, index) => {
    const age = (seconds / EMBER_LIFE_S + index / EMBERS + lot(index + 60)) % 1;
    const aloft = age * EMBER_LIFE_S;
    const angle = lot(index + 70) * Math.PI * 2 + aloft * 2;
    const out = size * 0.3 * (0.3 + age);
    return {
      position: [
        at[0] + Math.cos(angle) * out + wind[0] * aloft * 0.5,
        at[1] + Math.sin(angle) * out + wind[1] * aloft * 0.5,
        at[2] + size * 0.3 + aloft * (rise + 0.4),
      ] as Point,
      brightness: (1 - age) ** 1.5 * (0.7 + 0.3 * smoothNoise(seed + index, seconds * 9)),
    };
  });
  return { tongues, smoke, embers };
}

/** Floats a part takes: where it stands from the eye and its kind, its shape and lean, its colour and strength. */
const PART_FLOATS = 12;
const SMOKE_COLOUR = [0.13, 0.12, 0.12] as const;
const EMBER_COLOUR = [1, 0.55, 0.15] as const;
/** How far a fire's light reaches from its middle, in times its height: the deck round it and whoever stands there. */
export const GLOW_REACH = 3;
/** The light at a fire's middle, as the light layer takes it before its cut, which steps each channel on its own. Its
 *  green is half its red, so green's first step falls with red's second, and its blue never steps: the light runs
 *  from a red rim through orange to a gold heart, never a yellow, grey or pink step. */
export const GLOW_COLOUR = [0.6, 0.3, 0.03] as const;
const PREMULTIPLIED = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;

/** Fires, lit and put out by id, drawn as one of the scene's drawers over the water and into the light layer. */
export class Flames {
  /** The wind the smoke leans with, m/s east and south. */
  wind: Wind = [0, 0];
  private readonly device: GPUDevice;
  private readonly module: GPUShaderModule;
  private readonly overLayout: GPUBindGroupLayout;
  private readonly overPipeline: GPURenderPipeline;
  private readonly lightPipeline: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private bound: { depth: GPUTexture; group: GPUBindGroup } | null = null;
  private readonly fires = new Map<number, Fire>();
  private nextId = 1;
  private instances: GPUBuffer | null = null;
  private counts = { shown: 0, glows: 0 };

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
    // The glow tests the scene's own depth in its light, point by point, so the layer's coarser depth is not asked.
    this.lightPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.overLayout] }),
      vertex,
      fragment: { module: this.module, entryPoint: 'light_fragment', targets: [LIGHT_TARGET] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { ...LIGHT_DEPTH, depthCompare: 'always' },
    });
    this.view = device.createBuffer({ size: 144, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
  }

  /** Lights a fire `sizeM` tall (half a metre to four) with its base at `base` (world metres); gives its id. */
  light(base: Point, sizeM: number, seed: number): number {
    const id = this.nextId++;
    this.fires.set(id, { at: base, sizeM, seed });
    return id;
  }

  /** Puts the fire `id` out. */
  put(id: number): void {
    this.fires.delete(id);
  }

  /** Puts every fire out. */
  clear(): void {
    this.fires.clear();
  }

  /** Lets go of the fires' buffers on the GPU; with no fire left, nothing is drawn again. */
  destroy(): void {
    this.fires.clear();
    this.view.destroy();
    this.instances?.destroy();
    this.instances = null;
    this.bound = null;
  }

  /** Works out the fires' parts at `time`, measured from the eye of `shot`; they are drawn over the water. */
  drawInto(_pass: GPURenderPassEncoder, fromEye: Float32Array, shot: { readonly eye: Point }, time: number): void {
    const shown: number[] = [];
    const glows: number[] = [];
    const add = (into: number[], place: Point, kind: number, shape: readonly number[], colour: readonly number[]) =>
      into.push(place[0] - shot.eye[0], place[1] - shot.eye[1], place[2] - shot.eye[2], kind, ...shape, ...colour);
    for (const fire of this.fires.values()) {
      const parts = fireParts(fire, time, this.wind);
      for (const puff of parts.smoke)
        add(shown, puff.position, PART.smoke, [puff.radius, 0, 0, 0], [...SMOKE_COLOUR, puff.opacity]);
      for (const tongue of parts.tongues)
        add(shown, tongue.position, PART.tongue, [tongue.width, tongue.height, ...tongue.lean], [1, 1, 1, 1]);
      for (const ember of parts.embers)
        add(shown, ember.position, PART.ember, [fire.sizeM * 0.025, 0, 0, 0], [...EMBER_COLOUR, ember.brightness]);
      const flicker = Math.max(...parts.tongues.map((tongue) => tongue.height)) / fire.sizeM;
      const middle: Point = [fire.at[0], fire.at[1], fire.at[2] + fire.sizeM * 0.5];
      add(glows, middle, PART.glow, [fire.sizeM * GLOW_REACH, 0, 0, 0], [...GLOW_COLOUR, flicker]);
    }
    this.counts = { shown: shown.length / PART_FLOATS, glows: glows.length / PART_FLOATS };
    if (shown.length === 0) return;
    const values = Float32Array.from([...shown, ...glows]);
    if (!this.instances || this.instances.size < values.byteLength) {
      this.instances?.destroy();
      this.instances = this.device.createBuffer({
        size: Math.max(4096, values.byteLength * 2),
        usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
      });
    }
    this.device.queue.writeBuffer(this.instances, 0, values);
    const toEye = inverted(fromEye) ?? new Float32Array(16);
    this.device.queue.writeBuffer(
      this.view,
      0,
      Float32Array.from([...fromEye.subarray(0, 16), ...toEye, time, 0, 0, 0]),
    );
  }

  /** The smoke, flames and embers over the finished picture `target`, hidden where the scene's `depth` (one float a
   *  pixel, reversed) stands nearer. */
  overWater(encoder: GPUCommandEncoder, target: GPUTextureView, _fromEye: Float32Array, depth: GPUTexture): void {
    if (!this.instances || this.counts.shown === 0) return;
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.overPipeline);
    pass.setBindGroup(0, this.groupFor(depth));
    pass.setVertexBuffer(0, this.instances);
    pass.draw(6, this.counts.shown);
    pass.end();
  }

  /** Each fire's glow, into the light layer's pass (`LightLayer.encode`), lighting the scene drawn into `depth`. */
  lightInto(pass: GPURenderPassEncoder, _fromEye: Float32Array, depth: GPUTexture): void {
    if (!this.instances || this.counts.glows === 0) return;
    pass.setPipeline(this.lightPipeline);
    pass.setBindGroup(0, this.groupFor(depth));
    pass.setVertexBuffer(0, this.instances);
    pass.draw(6, this.counts.glows, 0, this.counts.shown);
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
