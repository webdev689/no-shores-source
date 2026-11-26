// Glowing points at night: many small lights (a city's lamps and lanterns) drawn as soft warm sprites over the finished
// picture after the water, one instanced draw, none of them a lamp of the sky's sixteen. Each is at least a few pixels
// across however far off, so a lit city reads from the sea; one standing over the water also lays a shimmering column
// of its light on the sea under it, as lights on water read at night. Hidden where the scene's depth stands nearer.
// Anything with a list of points may draw them: their places, colours, sizes and seeds are the caller's.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';

type Rgb = readonly [number, number, number];

/** A glowing point: where it burns (east, south, up, world metres), its colour at full, the size of its glow
 *  (metres across its middle), a seed its flicker keeps to, and how high it stands over the water under it (none for
 *  a light over the land). */
export interface GlowPoint {
  readonly at: readonly [number, number, number];
  readonly colour: Rgb;
  readonly sizeM: number;
  readonly seed: number;
  readonly overWaterM?: number;
}

/** Floats an instance takes: its place from the origin and size; its colour and seed; over the water, and whether it
 *  is the light (0) or its column on the water (1). */
export const GLOW_FLOATS = 12;
/** The fewest pixels across a point's middle is drawn, however far off, and its column on the water's least length. */
export const LEAST_PX = 2.2;
const COLUMN_LEAST_PX = 14;
/** The share of its distance a column on the water is tested nearer the eye than it lies. */
const COLUMN_PULL = 0.15;
/** How far nearer the eye a point is drawn than it stands, metres and a share of its distance: in front of the lamp
 *  it burns in, and just past the city's own pull (`cityShaders.ts` PULL_SHARE, 0.012), so what stands in front of
 *  it hides it unless within that share of its distance. */
const PULL_M = 0.6;
const PULL_SHARE = 0.013;

/** The instances for `points`, measured from `origin` (east, south), each point once and a column for each over the
 *  water after them all. */
export function glowInstances(points: readonly GlowPoint[], origin: readonly [number, number]): Float32Array {
  const over = points.filter((point) => (point.overWaterM ?? 0) > 0);
  const floats = new Float32Array((points.length + over.length) * GLOW_FLOATS);
  const write = (point: GlowPoint, slot: number, column: number) =>
    floats.set(
      [
        point.at[0] - origin[0],
        point.at[1] - origin[1],
        point.at[2],
        point.sizeM,
        ...point.colour,
        point.seed,
        point.overWaterM ?? 0,
        column,
        0,
        0,
      ],
      slot * GLOW_FLOATS,
    );
  points.forEach((point, slot) => write(point, slot, 0));
  over.forEach((point, slot) => write(point, points.length + slot, 1));
  return floats;
}

/** A point's size on screen, in pixels across its middle, drawn at `distance` metres by a view `pixelsPerRadian`
 *  fine: never less than LEAST_PX; and how bright it is drawn, dimmed as it is drawn larger than it stands. */
export function shownSize(sizeM: number, distance: number, pixelsPerRadian: number): { px: number; bright: number } {
  const truePx = (sizeM / Math.max(distance, 1e-3)) * pixelsPerRadian;
  const shown = Math.max(truePx, LEAST_PX);
  return { px: shown, bright: Math.min(1, Math.max(0.45, Math.sqrt(truePx / shown))) };
}

export const GLOW_WGSL = /* wgsl */ `
struct View {
  from_eye: mat4x4f,
  // the eye from the origin, and the time
  eye: vec4f,
  // how lit (0 to 1), half the picture's width and height in pixels
  look: vec4f,
};
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var depths: texture_2d<f32>;

struct Point {
  @location(0) place: vec4f,
  @location(1) colour: vec4f,
  @location(2) water: vec4f,
};

struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) colour: vec3f,
  @location(2) @interpolate(flat) seed: vec2f,
};

const CORNERS = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));

fn pulled(offset: vec3f) -> vec3f {
  let distance = max(length(offset), 1e-3);
  return offset * max(0.2, 1.0 - (${PULL_M} + ${PULL_SHARE} * distance) / distance);
}

@vertex fn glow_vertex(@builtin(vertex_index) index: u32, point: Point) -> Out {
  var out: Out;
  let corner = CORNERS[index];
  let column = point.water.y > 0.5;
  // a column lies on the water under its light
  let place = point.place.xyz - vec3f(0.0, 0.0, select(0.0, point.water.x, column));
  let clip = view.from_eye * vec4f(pulled(place - view.eye.xyz), 1.0);
  out.position = vec4f(0.0, 0.0, -1.0, 1.0);
  if (clip.w <= 0.05) { return out; }
  // its middle's size in pixels, the true one and as drawn
  let true_px = point.place.w / clip.w * view.from_eye[1][1] * view.look.w;
  let px = max(true_px, ${LEAST_PX});
  let bright = clamp(sqrt(true_px / px), 0.45, 1.0);
  // the glow reaches three times its middle's size, so its halo falls off softly
  var half = vec2f(px * 1.5);
  var shift = vec2f(0.0);
  if (column) {
    // the ripples stretch its mirror image down the water toward the eye, six times as long as its light stands over
    // it, as wide as its middle
    let fall = max(point.water.x * 6.0 / clip.w * view.from_eye[1][1] * view.look.w, ${COLUMN_LEAST_PX});
    half = vec2f(max(px * 0.6, 1.5), fall * 0.5);
    shift = vec2f(0.0, -fall * 0.4);
  }
  let offset = (corner * half + shift) / view.look.zw * clip.w;
  // the sea's floor under the column stands nearer than its light and the water is drawn after the depth read here,
  // so a column is tested as standing COLUMN_PULL of the way nearer: what stands well in front of it still hides it
  let tested = view.from_eye * vec4f((place - view.eye.xyz) * select(1.0, ${1 - COLUMN_PULL}, column), 1.0);
  out.position = vec4f(clip.xy + offset, tested.z / tested.w * clip.w, clip.w);
  out.uv = corner;
  out.colour = point.colour.rgb * bright * view.look.x;
  out.seed = vec2f(point.colour.w, select(0.0, 1.0, column));
  return out;
}

@fragment fn glow_fragment(in: Out) -> @location(0) vec4f {
  if (in.position.z < textureLoad(depths, vec2i(in.position.xy), 0).r) { discard; }
  let time = view.eye.w;
  let flicker = 0.92 + 0.08 * sin(time * 7.3 + in.seed.x * 12.9) * sin(time * 3.1 + in.seed.x * 5.3);
  if (in.seed.y > 0.5) {
    // the column: brightest under its light, broken into ripples drifting down it
    let down = in.uv.y * -0.5 + 0.5;
    let ripple = 0.5 + 0.5 * sin(down * 38.0 - time * 2.6 + in.seed.x * 9.0) * sin(down * 11.0 + time * 1.3);
    let across = exp(-in.uv.x * in.uv.x * 3.0);
    let light = in.colour * 0.8 * ripple * across * (1.0 - down) * flicker;
    return vec4f(light, 0.0);
  }
  let reach = dot(in.uv, in.uv) * 2.25;
  let light = in.colour * (exp(-reach * 7.0) * 1.2 + exp(-reach * 2.2) * 0.25) * flicker;
  return vec4f(light, 0.0);
}
`;

const ADD = { srcFactor: 'one', dstFactor: 'one', operation: 'add' } as const;
const KEEP = { srcFactor: 'zero', dstFactor: 'one', operation: 'add' } as const;
const VIEW_BYTES = 96;

/** A set of glowing points on the GPU, laid once, drawn over the finished picture each frame they are lit. */
export class GlowPoints {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly layout: GPUBindGroupLayout;
  private readonly view: GPUBuffer;
  private readonly instances: GPUBuffer;
  private readonly count: number;
  private readonly origin: readonly [number, number];
  private readonly values = new Float32Array(VIEW_BYTES / 4);
  private bound: { depth: GPUTexture; group: GPUBindGroup } | null = null;

  /** `points` measured from `origin` (east, south, world metres), so the GPU's floats keep their precision. */
  constructor(gpu: Gpu, points: readonly GlowPoint[], origin: readonly [number, number]) {
    const { device } = gpu;
    this.device = device;
    this.origin = origin;
    const module = device.createShaderModule({ code: GLOW_WGSL });
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: {
        module,
        entryPoint: 'glow_vertex',
        buffers: [
          {
            arrayStride: GLOW_FLOATS * 4,
            stepMode: 'instance',
            attributes: [0, 1, 2].map((location) => ({
              shaderLocation: location,
              offset: location * 16,
              format: 'float32x4' as const,
            })),
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'glow_fragment',
        targets: [{ format: gpu.format, blend: { color: ADD, alpha: KEEP } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    this.view = device.createBuffer({ size: VIEW_BYTES, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    const floats = glowInstances(points, origin);
    this.count = floats.length / GLOW_FLOATS;
    this.instances = device.createBuffer({
      size: Math.max(16, floats.byteLength),
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    if (floats.byteLength) device.queue.writeBuffer(this.instances, 0, floats);
  }

  /** Bytes it holds on the GPU. */
  get bytes(): number {
    return this.instances.size + this.view.size;
  }

  /**
   * Draws the points over the finished picture `target`, hidden where the scene's `depth` (one float a pixel,
   * reversed) stands nearer: seen from `eye` (world metres) through `fromEye`, `lit` (0 to 1) as bright as they burn
   * now. Nothing is drawn while they are out.
   */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    depth: GPUTexture,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    lit: number,
    time: number,
  ): void {
    if (lit <= 0 || this.count === 0) return;
    const { values } = this;
    values.set(fromEye.subarray(0, 16), 0);
    values.set([eye[0] - this.origin[0], eye[1] - this.origin[1], eye[2], time], 16);
    values.set([lit, 0, depth.width / 2, depth.height / 2], 20);
    this.device.queue.writeBuffer(this.view, 0, values);
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.groupFor(depth));
    pass.setVertexBuffer(0, this.instances);
    pass.draw(6, this.count);
    pass.end();
  }

  /** Lets go of its buffers. */
  destroy(): void {
    this.instances.destroy();
    this.view.destroy();
    this.bound = null;
  }

  /** The view and the scene's depth, bound once for each depth texture. */
  private groupFor(depth: GPUTexture): GPUBindGroup {
    if (this.bound?.depth !== depth) {
      const group = this.device.createBindGroup({
        layout: this.layout,
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
