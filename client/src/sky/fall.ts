import { type Gpu, SHADER_STAGE } from '../gpu.ts';
import { SKY_WGSL, type SkyLook, type SkyUniform, skyUniformFor } from './skyUniform.ts';

/** The box round the eye the fall is drawn in, metres, and how much of each falls at its hardest. */
export const FALL_BOX_M = 24;
export const MOST_DROPS = 14000;
export const MOST_FLAKES = 15000;
export const MOST_GRAINS = 6000;
/** Above this height over the ground the eye sees the weather from above, not in it: no fall is drawn. */
export const FALL_HIGHEST_M = 300;
/** The longest step a frame carries the fall, seconds: a long frame, a hidden tab's return or a clock set back moves
 *  it no further than a slow frame does. */
export const LONGEST_FALL_STEP_S = 0.1;

/** Each kind (rain, snow, sand): the most drawn, how fast it falls (m/s), the share of the wind that carries it, its
 *  colour, how clear one is at the hardest fall, its box's height (metres), its width on the screen (pixels), and for
 *  a flake the distance it is drawn that wide at (metres): nearer it is larger, as a flake by the face is. */
const KINDS = [
  {
    most: MOST_DROPS,
    falls: 9,
    carried: 0.55,
    colour: [0.86, 0.9, 1],
    clear: 0.5,
    high: FALL_BOX_M,
    wide: 1.6,
    seenM: 0,
  },
  {
    most: MOST_FLAKES,
    falls: 1.1,
    carried: 0.9,
    colour: [1, 1, 1],
    clear: 0.75,
    high: FALL_BOX_M,
    wide: 2.2,
    seenM: 4,
  },
  {
    most: MOST_GRAINS,
    falls: 0.3,
    carried: 1.2,
    colour: [0.82, 0.68, 0.48],
    clear: 0.45,
    high: FALL_BOX_M / 4,
    wide: 2.2,
    seenM: 0,
  },
] as const;

/** A point or a motion east, south and up: metres, or m/s. */
type Vec3 = readonly [number, number, number];

const wrap = (value: number, side: number): number => ((value % side) + side) % side;

/**
 * A kind's running offset (metres) carried on by `velocity` (m/s) for a frame's `seconds`, each part wrapped into the
 * box (metres each way). Carried a step at a time, a change of wind changes how fast the fall moves, never where it
 * stands; wrapped in doubles here, it reaches the GPU's floats small and exact however long the page runs.
 */
export function carriedOn(offset: Vec3, velocity: Vec3, seconds: number, box: Vec3): [number, number, number] {
  const step = seconds > 0 ? Math.min(seconds, LONGEST_FALL_STEP_S) : 0;
  return [
    wrap(offset[0] + velocity[0] * step, box[0]),
    wrap(offset[1] + velocity[1] * step, box[1]),
    wrap(offset[2] + velocity[2] * step, box[2]),
  ];
}

/** What falls, and how much of it: rain, snow and sand each 0 to 1. */
export interface Falling {
  readonly rain: number;
  readonly snow: number;
  readonly sand: number;
}

/** The rain's, the snow's and the sand's shares of what is falling now, from the sky's look. */
export function fallingOf(look: SkyLook): Falling {
  const snow = look.falling * look.snowShare;
  return { rain: look.falling - snow, snow, sand: look.sand };
}

export const FALL_WGSL = /* wgsl */ `
${SKY_WGSL}
struct Fall {
  from_eye: mat4x4f,
  // Where the lattice stands from the eye, metres east, south and up within the box: the kind's running offset less
  // the eye's place. Then the box's height.
  place: vec4f,
  // The wind carrying it, m/s east and south, how fast it falls, and how long a streak's tail is, seconds.
  motion: vec4f,
  // Its kind (0 rain, 1 snow, 2 sand), how many of the most are drawn, the box's side, and the sea from the eye.
  shape: vec4f,
  // The light on it, and how clear one is at the hardest fall.
  light: vec4f,
  // The picture's size in pixels, a streak's width in pixels, and the distance a flake is drawn that wide at (0 none).
  screen: vec4f,
  // The flakes' eddies' phases east and south, radians.
  eddy: vec4f,
}
@group(0) @binding(0) var<uniform> fall: Fall;
@group(0) @binding(1) var scene_depth: texture_2d<f32>;

fn hash3(index: u32) -> vec3f {
  var bits = vec3u(index * 747796405u + 2891336453u, index * 1664525u + 1013904223u, index * 2654435761u + 7u);
  bits = (bits ^ (bits >> vec3u(16u))) * 2246822519u;
  bits = (bits ^ (bits >> vec3u(13u))) * 3266489917u;
  bits = bits ^ (bits >> vec3u(16u));
  return vec3f(bits) / 4294967295.0;
}

struct Drawn { @builtin(position) position: vec4f, @location(0) clear: f32, @location(1) across: f32 }

@vertex fn fall_vertex(@builtin(vertex_index) index: u32, @builtin(instance_index) which: u32) -> Drawn {
  var out: Drawn;
  out.position = vec4f(2.0, 2.0, 2.0, 1.0);
  let seed = hash3(which);
  let side = fall.shape.z;
  let kind = u32(fall.shape.x);
  let velocity = vec3f(fall.motion.xy, -fall.motion.z);
  let box = vec3f(side, side, fall.place.w);
  // Each one stands in the world at its seeded place, carried with its kind, and the box round the eye wraps it.
  var moved = seed * box + fall.place.xyz;
  if (kind == 1u) {
    // A flake sways about where it falls on its own small eddy, swinging at up to 0.45 m/s: a sway, not a drift.
    let phase = seed.x * 6.2831853;
    moved += vec3f(-cos(fall.eddy.x + phase) / 1.3, sin(fall.eddy.y + phase * 1.7) / 1.1, 0.0) * 0.45;
  }
  var from_eye = fract(moved / box) * box - box * 0.5;
  if (kind == 2u) { from_eye.z = from_eye.z - side * 0.08; }
  if (from_eye.z < fall.shape.w || sky_sheltered(from_eye)) { return out; }
  let distance = length(from_eye);
  let fade = (1.0 - smoothstep(side * 0.32, side * 0.5, distance)) * smoothstep(0.4, 1.5, distance);
  let tail = from_eye - velocity * select(fall.motion.w, fall.motion.w * 0.15, kind == 1u);
  let head_clip = fall.from_eye * vec4f(from_eye, 1.0);
  let tail_clip = fall.from_eye * vec4f(tail, 1.0);
  if (head_clip.w <= 0.05 || tail_clip.w <= 0.05) { return out; }
  let head = head_clip.xy / head_clip.w;
  let behind = tail_clip.xy / tail_clip.w;
  let pixel = 2.0 / fall.screen.xy;
  var along = (behind - head) / pixel;
  // A flake or a grain is a dot, a flake larger nearer than screen.w; a drop a streak at least as long as it is wide.
  var wide = fall.screen.z;
  if (fall.screen.w > 0.0) { wide = clamp(wide * fall.screen.w / distance, wide, wide * 3.0); }
  if (kind != 0u || length(along) < wide) { along = vec2f(0.0, wide); }
  let across = normalize(vec2f(-along.y, along.x)) * wide * 0.5;
  let corner = array(vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0))[index];
  let at = head + (along * corner.x + across * corner.y) * pixel;
  out.position = vec4f(at * head_clip.w, head_clip.z, head_clip.w);
  out.clear = fade * fall.light.w * (0.6 + 0.4 * seed.y);
  out.across = corner.y;
  return out;
}

@fragment fn fall_fragment(drawn: Drawn) -> @location(0) vec4f {
  // What stands nearer than it in the scene hides it: the scene's depth is reversed, nearer is more.
  if (textureLoad(scene_depth, vec2i(drawn.position.xy), 0).r > drawn.position.z) { discard; }
  let soft = 1.0 - drawn.across * drawn.across;
  return vec4f(fall.light.rgb, drawn.clear * soft);
}
`;

const FALL_FLOATS = 16 + 4 * 6;

/**
 * Rain, snow and sand round the eye, drawn over the finished picture: each drop, flake or grain stands in the world,
 * carried by the wind and its fall, in a box that wraps round the eye, so walking through it leaves it where it is.
 * The scene's depth hides what stands behind the land, the city or a figure; nothing falls under the sea.
 */
export class FallView {
  private readonly gpu: Gpu;
  private readonly layout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  /** The sky's shelter grid: no drop is drawn under a roof. */
  private readonly sky: SkyUniform;
  private readonly uniforms: GPUBuffer[];
  private readonly values = new Float32Array(FALL_FLOATS);
  /** Each kind's running offset, metres, and the page's time it was carried to, seconds. */
  private offsets: [number, number, number][] = KINDS.map(() => [0, 0, 0]);
  private carriedS = Number.NaN;
  /** Each kind's bind group for the scene's depth they were made for. */
  private bound: { depth: GPUTexture; groups: GPUBindGroup[] } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const sky = skyUniformFor(device);
    this.sky = sky;
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const module = device.createShaderModule({ code: FALL_WGSL });
    const over = { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout, sky.empty, sky.empty, sky.layout] }),
      vertex: { module, entryPoint: 'fall_vertex' },
      fragment: {
        module,
        entryPoint: 'fall_fragment',
        targets: [
          { format: gpu.format, blend: { color: over, alpha: { ...over, srcFactor: 'zero', dstFactor: 'one' } } },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    // GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST: one buffer for each kind, all drawn in one pass.
    this.uniforms = KINDS.map(() => device.createBuffer({ size: FALL_FLOATS * 4, usage: 0x40 | 0x8 }));
  }

  /** Draws what falls over `target`, tested against the scene's `depth`, for an eye at `eye` (world metres) whose
   *  points `fromEye` takes to the picture, at the page's time `time`. Nothing when the eye is high over the ground. */
  encode(
    encoder: GPUCommandEncoder,
    view: { target: GPUTextureView; depth: GPUTexture; size: readonly [number, number] },
    camera: { fromEye: Float32Array; eye: readonly [number, number, number]; aboveM: number },
    look: SkyLook,
    time: number,
  ): void {
    // The fall moves on while none is drawn, so it is where it would be when it shows again.
    const seconds = time - this.carriedS;
    this.carriedS = time;
    this.offsets = KINDS.map(({ carried, falls, high }, which) => {
      const velocity = [look.wind[0] * carried, look.wind[1] * carried, -falls] as const;
      return carriedOn(this.offsets[which] ?? [0, 0, 0], velocity, seconds, [FALL_BOX_M, FALL_BOX_M, high]);
    });
    const falling = fallingOf(look);
    if (camera.aboveM > FALL_HIGHEST_M || falling.rain + falling.snow + falling.sand < 0.01) return;
    const { device } = this.gpu;
    // A drop catches the sky's light, a little of the key light, and lightning's flash: brighter than the dark
    // things it falls past, about as bright as the sky behind it.
    const sky = (look.horizon[0] + look.horizon[1] + look.horizon[2]) / 3;
    const level = Math.min(1.4, 1.25 * sky + 0.15 * look.keyBright + 0.8 * look.flash + 0.03);
    const shares = [falling.rain, falling.snow, falling.sand];
    const groups = this.groupsFor(view.depth);
    const values = this.values;
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: view.target, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    this.sky.bindShared(pass, [1, 2]);
    KINDS.forEach((kind, which) => {
      const count = Math.floor(kind.most * (shares[which] ?? 0));
      const [uniform, group, offset] = [this.uniforms[which], groups[which], this.offsets[which]];
      if (count < 1 || !uniform || !group || !offset) return;
      const [east, south, up] = camera.eye;
      const place = [
        wrap(offset[0] - east, FALL_BOX_M),
        wrap(offset[1] - south, FALL_BOX_M),
        wrap(offset[2] - up, kind.high),
      ];
      values.set(camera.fromEye, 0);
      values.set([...place, kind.high], 16);
      values.set([look.wind[0] * kind.carried, look.wind[1] * kind.carried, kind.falls, 0.07], 20);
      values.set([which, count, FALL_BOX_M, -up], 24);
      values.set([kind.colour[0] * level, kind.colour[1] * level, kind.colour[2] * level, kind.clear], 28);
      values.set([view.size[0], view.size[1], kind.wide, kind.seenM], 32);
      values.set([(time * 1.3) % (Math.PI * 2), (time * 1.1) % (Math.PI * 2), 0, 0], 36);
      device.queue.writeBuffer(uniform, 0, values);
      pass.setBindGroup(0, group);
      pass.draw(6, count);
    });
    pass.end();
  }

  /** The kinds' bind groups for the scene's depth `depth`, made again only when the scene makes a new one. */
  private groupsFor(depth: GPUTexture): GPUBindGroup[] {
    if (this.bound?.depth === depth) return this.bound.groups;
    const depthView = depth.createView();
    const groups = this.uniforms.map((uniform) =>
      this.gpu.device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: uniform } },
          { binding: 1, resource: depthView },
        ],
      }),
    );
    this.bound = { depth, groups };
    return groups;
  }
}
