import { type Gpu, SHADER_STAGE } from '../gpu.ts';
import { flashOf } from './skyDriver.ts';
import type { Strike } from './skyLaw.ts';
import { smoothstep } from '../water/shore.ts';

/** The most segments drawn in a frame, a strike's main channel's, and the share of its length a branch runs. */
export const MOST_SEGMENTS = 512;
const CHANNEL_SEGMENTS = 28;
const BRANCH_SHARE = 0.35;
/** The least a cloud's base stands over the ground it strikes, metres: a hill that rises into the deck still takes a
 *  bolt from above it. */
export const LOWEST_BASE_OVER_GROUND_M = 200;

/** A point east, south and up, metres. */
type Point = readonly [number, number, number];

/** A small hash of whole numbers to [0, 1): a strike's own shape from where and when it fell. */
function draw(seed: number, salt: number): number {
  let bits = Math.imul(seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35) >>> 0;
  bits = Math.imul(bits ^ (bits >>> 15), 0x2c1b3c6d) >>> 0;
  bits = (bits ^ (bits >>> 12)) >>> 0;
  return bits / 4294967296;
}

/** A strike's seed, the same in every browser for the same strike. */
const seedOf = (strike: Strike): number =>
  (Math.round(strike.x) * 73856093) ^ (Math.round(strike.y) * 19349663) ^ Math.round(strike.atS * 1000);

/**
 * A strike's path as segments, world metres: to the ground, a jagged channel from the cloud base `baseM` down to the
 * ground under the strike at `groundM`, with two branches off it; in the cloud, a channel running 60 to 120 m under
 * the base, as a crawler is seen from below (inside the cloud it would only light it). The base stands at least
 * LOWEST_BASE_OVER_GROUND_M over the ground. Each segment holds its ends and how bright it is against the main channel.
 */
export function boltPath(strike: Strike, baseM: number, groundM: number): (readonly [Point, Point, number])[] {
  const seed = seedOf(strike);
  const base = Math.max(baseM, groundM + LOWEST_BASE_OVER_GROUND_M);
  const segments: (readonly [Point, Point, number])[] = [];
  const walk = (from: Point, to: Point, steps: number, brightness: number, salt: number): Point[] => {
    const points: Point[] = [from];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    for (let step = 1; step <= steps; step++) {
      const share = step / steps;
      const wander = step === steps ? 0 : length * 0.06;
      const point: Point = [
        from[0] + (to[0] - from[0]) * share + (draw(seed, salt + step * 3) - 0.5) * wander,
        from[1] + (to[1] - from[1]) * share + (draw(seed, salt + step * 3 + 1) - 0.5) * wander,
        from[2] + (to[2] - from[2]) * share + (draw(seed, salt + step * 3 + 2) - 0.5) * wander * 0.3,
      ];
      const last = points[points.length - 1] ?? from;
      segments.push([last, point, brightness]);
      points.push(point);
    }
    return points;
  };
  if (strike.toGround) {
    const top: Point = [strike.x + (draw(seed, 1) - 0.5) * 800, strike.y + (draw(seed, 2) - 0.5) * 800, base];
    const channel = walk(top, [strike.x, strike.y, groundM], CHANNEL_SEGMENTS, 1, 10);
    for (const branch of [0, 1]) {
      const start = channel[Math.floor(CHANNEL_SEGMENTS * (0.2 + 0.3 * draw(seed, 20 + branch)))] ?? top;
      const reach = (base - groundM) * BRANCH_SHARE;
      const end: Point = [
        start[0] + (draw(seed, 30 + branch) - 0.5) * reach,
        start[1] + (draw(seed, 40 + branch) - 0.5) * reach,
        start[2] - reach * 0.6,
      ];
      walk(start, end, 10, 0.35, 100 + branch * 50);
    }
  } else {
    const heading = draw(seed, 3) * Math.PI * 2;
    const span = 2500 + 3500 * draw(seed, 4);
    const half: Point = [(Math.sin(heading) * span) / 2, (-Math.cos(heading) * span) / 2, 0];
    const height = base - 60 - 60 * draw(seed, 5);
    walk(
      [strike.x - half[0], strike.y - half[1], height],
      [strike.x + half[0], strike.y + half[1], height],
      CHANNEL_SEGMENTS,
      0.7,
      10,
    );
  }
  return segments;
}

export const BOLT_WGSL = /* wgsl */ `
struct Bolts { from_eye: mat4x4f, screen: vec4f }
@group(0) @binding(0) var<uniform> bolts: Bolts;
@group(0) @binding(1) var<storage, read> segments: array<vec4f>;
@group(0) @binding(2) var scene_depth: texture_2d<f32>;

struct Drawn { @builtin(position) position: vec4f, @location(0) light: f32, @location(1) across: f32 }

// Each segment two points from the eye (xyz) with its light (w of the first) and its width in pixels (w of the second).
@vertex fn bolt_vertex(@builtin(vertex_index) index: u32, @builtin(instance_index) which: u32) -> Drawn {
  var out: Drawn;
  out.position = vec4f(2.0, 2.0, 2.0, 1.0);
  let first = segments[which * 2u];
  let second = segments[which * 2u + 1u];
  let from_clip = bolts.from_eye * vec4f(first.xyz, 1.0);
  let to_clip = bolts.from_eye * vec4f(second.xyz, 1.0);
  if (from_clip.w <= 1.0 || to_clip.w <= 1.0) { return out; }
  let pixel = 2.0 / bolts.screen.xy;
  let start = from_clip.xy / from_clip.w;
  let finish = to_clip.xy / to_clip.w;
  let along = (finish - start) / pixel;
  let across = normalize(vec2f(-along.y, along.x) + vec2f(1e-6, 0.0)) * second.w * 0.5;
  let corner = array(vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0))[index];
  let clip = mix(from_clip, to_clip, corner.x);
  let at = mix(start, finish, corner.x) + across * corner.y * pixel;
  out.position = vec4f(at * clip.w, clip.z, clip.w);
  out.light = first.w;
  out.across = corner.y;
  return out;
}

@fragment fn bolt_fragment(drawn: Drawn) -> @location(0) vec4f {
  if (textureLoad(scene_depth, vec2i(drawn.position.xy), 0).r > drawn.position.z) { discard; }
  let core = 1.0 - smoothstep(0.2, 1.0, abs(drawn.across));
  return vec4f(vec3f(0.82, 0.88, 1.0) * drawn.light * core, 0.0);
}
`;

/** The strikes a frame draws: every one followed, the world's time, the cloud's base (metres over the sea), the
 *  ground's height at a point (null where no land is known), and the air they are seen through (throughAir). */
export interface StrikesNow {
  readonly list: readonly Strike[];
  readonly worldS: number;
  readonly baseM: number;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly air: Air;
}

/** The air a light is seen through: the clear air's haze over `clearM`, and the weather's fog of `fogDensity` a metre,
 *  which lies under `topM`, the cloud deck's base (metres over the sea), as its rain and mist do. */
export interface Air {
  readonly clearM: number;
  readonly fogDensity: number;
  readonly topM: number;
}

/**
 * How many metres of a line of sight `distance` long, from `fromM` to `toM` over the sea, the weather's fog lies
 * along: all of it while the eye is under the deck's base `topM`, and once the eye has risen to twice that only the
 * part under it, the share between eased, so from the Overworld's view over an island the land shows through the rain.
 * The water's shader keeps the same law (under_weather in waterCommon.ts).
 */
export function underWeatherM(fromM: number, toM: number, distance: number, topM: number): number {
  const rise = Math.abs(toM - fromM);
  const low = Math.min(fromM, toM);
  const under = rise < 1 ? (fromM < topM ? distance : 0) : distance * Math.min(1, Math.max(0, (topM - low) / rise));
  return distance + (under - distance) * smoothstep(topM, 2 * topM, fromM);
}

/**
 * How much of a light at `fromEye` (metres from the eye, up) reaches an eye `eyeHighM` over the sea through `air`: the
 * clear air's haze, and the weather's fog along the line under its top, thickest low down (by e every 60 m up). The
 * land and the sea are hazed by the same law (aerial in waterCommon.ts), so a bolt's foot fades as the sea under it
 * does.
 */
export function throughAir(eyeHighM: number, fromEye: Point, air: Air): number {
  const distance = Math.hypot(fromEye[0], fromEye[1], fromEye[2]);
  const from = Math.max(eyeHighM, 0);
  const rise = Math.max(eyeHighM + fromEye[2], 0) - from;
  const [lowFrom, lowTo] = [Math.exp(-from / 60), Math.exp(-(from + rise) / 60)];
  const low = Math.abs(rise) < 1 ? lowFrom : (60 * (lowFrom - lowTo)) / rise;
  const weather = air.fogDensity * underWeatherM(from, from + rise, distance, air.topM);
  return Math.exp(-distance / air.clearM - weather - air.fogDensity * 1.5 * Math.min(1, Math.max(0, low)) * distance);
}

/**
 * Writes the strikes flashing now into `into`, each segment two points from the eye `eye`: xyz with its light, then
 * xyz with its width in pixels. Each bolt runs to the ground under its own strike, or to the sea where that lies
 * under it or no land is known. Gives how many floats it wrote.
 */
export function boltsInto(into: Float32Array, eye: readonly [number, number, number], strikes: StrikesNow): number {
  let floats = 0;
  for (const strike of strikes.list) {
    const distance = Math.hypot(strike.x - eye[0], strike.y - eye[1]);
    const light = flashOf(strike, strikes.worldS - strike.atS, distance * 0.5) * 3;
    if (light <= 0.01) continue;
    const groundM = Math.max(0, strikes.groundAt(strike.x, strike.y) ?? 0);
    for (const [from, to, brightness] of boltPath(strike, strikes.baseM, groundM)) {
      if (floats + 8 > into.length) return floats;
      const width = Math.max(1.5, (strike.toGround ? 4 : 3) * brightness * Math.min(1, 3000 / Math.max(distance, 1)));
      const middle: Point = [
        (from[0] + to[0]) / 2 - eye[0],
        (from[1] + to[1]) / 2 - eye[1],
        (from[2] + to[2]) / 2 - eye[2],
      ];
      // The channel is far brighter than the picture can show, so haze dims it only where it lets through under a
      // fifth: in heavy rain the foot of a far bolt fades into the grey, and the rest of it still blazes.
      const seen = Math.min(1, 5 * throughAir(eye[2], middle, strikes.air));
      into.set([from[0] - eye[0], from[1] - eye[1], from[2] - eye[2], light * brightness * seen], floats);
      into.set([to[0] - eye[0], to[1] - eye[1], to[2] - eye[2], width], floats + 4);
      floats += 8;
    }
  }
  return floats;
}

/**
 * Lightning's bolts over the finished picture, added as light: each strike near the eye while its strokes flash, its
 * channel from the cloud to the ground or across under the cloud, hidden where the land or the city stands nearer.
 */
export class BoltView {
  private readonly gpu: Gpu;
  private readonly layout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniform: GPUBuffer;
  private readonly segments: GPUBuffer;
  private readonly uniformValues = new Float32Array(20);
  private readonly segmentValues = new Float32Array(MOST_SEGMENTS * 8);
  /** The bind group for the scene's depth it was made for. */
  private bound: { depth: GPUTexture; group: GPUBindGroup } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const seen = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: seen, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.vertex, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const module = device.createShaderModule({ code: BOLT_WGSL });
    const add = { srcFactor: 'one', dstFactor: 'one', operation: 'add' } as const;
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: { module, entryPoint: 'bolt_vertex' },
      fragment: {
        module,
        entryPoint: 'bolt_fragment',
        targets: [{ format: gpu.format, blend: { color: add, alpha: add } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    // GPUBufferUsage.UNIFORM | COPY_DST, and STORAGE | COPY_DST.
    this.uniform = device.createBuffer({ size: 80, usage: 0x40 | 0x8 });
    this.segments = device.createBuffer({ size: MOST_SEGMENTS * 32, usage: 0x80 | 0x8 });
  }

  /** Draws the strikes flashing now over `target`, tested against the scene's `depth`, for an eye at `eye` (world
   *  metres) whose points `fromEye` takes to the picture; from the cloud's base `baseM` to the ground `groundAt`. */
  encode(
    encoder: GPUCommandEncoder,
    view: { target: GPUTextureView; depth: GPUTexture; size: readonly [number, number] },
    camera: { fromEye: Float32Array; eye: readonly [number, number, number] },
    strikes: StrikesNow,
  ): void {
    const floats = boltsInto(this.segmentValues, camera.eye, strikes);
    if (floats === 0) return;
    const { device } = this.gpu;
    this.uniformValues.set(camera.fromEye, 0);
    this.uniformValues.set([view.size[0], view.size[1], 0, 0], 16);
    device.queue.writeBuffer(this.uniform, 0, this.uniformValues);
    device.queue.writeBuffer(this.segments, 0, this.segmentValues, 0, floats);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: view.target, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.groupFor(view.depth));
    pass.draw(6, floats / 8);
    pass.end();
  }

  /** The bind group for the scene's depth `depth`, made again only when the scene makes a new one. */
  private groupFor(depth: GPUTexture): GPUBindGroup {
    if (this.bound?.depth === depth) return this.bound.group;
    const group = this.gpu.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: this.segments } },
        { binding: 2, resource: depth.createView() },
      ],
    });
    this.bound = { depth, group };
    return group;
  }
}
