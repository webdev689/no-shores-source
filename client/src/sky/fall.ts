import { type Gpu, SHADER_STAGE } from '../gpu.ts';
import type { SkyLook } from './skyUniform.ts';

/** The box round the eye the fall is drawn in, metres, and how much of each falls at its hardest. */
export const FALL_BOX_M = 24;
export const MOST_DROPS = 14000;
export const MOST_FLAKES = 5000;
export const MOST_GRAINS = 6000;
/** How fast rain and snow fall, m/s, and how much of the wind carries each. */
const RAIN_FALLS_M_S = 9;
const SNOW_FALLS_M_S = 1.1;
/** Above this height over the ground the eye sees the weather from above, not in it: no fall is drawn. */
export const FALL_HIGHEST_M = 300;

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
struct Fall {
  from_eye: mat4x4f,
  // The eye's place within the box's lattice (world metres modulo the box), and the page's time, seconds.
  anchor: vec4f,
  // The wind carrying it, m/s east and south, how fast it falls, and how long a streak's tail is, seconds.
  motion: vec4f,
  // Its kind (0 rain, 1 snow, 2 sand), how many of the most are drawn, the box's side, and the sea from the eye.
  shape: vec4f,
  // The light on it, and how clear one is at the hardest fall.
  light: vec4f,
  // The picture's size in pixels, a streak's width in pixels.
  screen: vec4f,
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
  let time = fall.anchor.w;
  var velocity = vec3f(fall.motion.xy, -fall.motion.z);
  if (kind == 1u) {
    // A flake drifts on its own small eddies as it falls.
    let phase = seed.x * 6.2831853;
    velocity += vec3f(sin(time * 1.3 + phase), cos(time * 1.1 + phase * 1.7), 0.0) * 0.45;
  }
  var box = vec3f(side, side, side * select(1.0, 0.25, kind == 2u));
  // Each one stands in the world, carried by its motion, and the box round the eye wraps it.
  let moved = seed * box + velocity * time - vec3f(fall.anchor.xy, 0.0);
  var from_eye = fract(moved / box) * box - box * 0.5;
  if (kind == 2u) { from_eye.z = from_eye.z - side * 0.08; }
  if (from_eye.z < fall.shape.w) { return out; }
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
  // A flake or a grain is a dot; a drop a streak at least as long as it is wide.
  if (kind != 0u || length(along) < fall.screen.z) { along = vec2f(0.0, fall.screen.z); }
  let across = normalize(vec2f(-along.y, along.x)) * fall.screen.z * 0.5;
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

const FALL_FLOATS = 16 + 4 * 5;

/**
 * Rain, snow and sand round the eye, drawn over the finished picture: each drop, flake or grain stands in the world,
 * carried by the wind and its fall, in a box that wraps round the eye, so walking through it leaves it where it is.
 * The scene's depth hides what stands behind the land, the city or a figure; nothing falls under the sea.
 */
export class FallView {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer[];

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const module = device.createShaderModule({ code: FALL_WGSL });
    const over = { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
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
    this.uniforms = [0, 1, 2].map(() => device.createBuffer({ size: FALL_FLOATS * 4, usage: 0x40 | 0x8 }));
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
    const falling = fallingOf(look);
    if (camera.aboveM > FALL_HIGHEST_M || falling.rain + falling.snow + falling.sand < 0.01) return;
    const { device } = this.gpu;
    // A drop catches the sky's light, a little of the key light, and lightning's flash: brighter than the dark
    // things it falls past, about as bright as the sky behind it.
    const lightOn = (base: readonly [number, number, number]): [number, number, number] => {
      const sky = (look.horizon[0] + look.horizon[1] + look.horizon[2]) / 3;
      const level = Math.min(1.4, 1.25 * sky + 0.15 * look.keyBright + 0.8 * look.flash + 0.03);
      return [base[0] * level, base[1] * level, base[2] * level];
    };
    const kinds = [
      {
        count: MOST_DROPS * falling.rain,
        speed: RAIN_FALLS_M_S,
        carried: 0.55,
        light: lightOn([0.86, 0.9, 1]),
        clear: 0.5,
      },
      {
        count: MOST_FLAKES * falling.snow,
        speed: SNOW_FALLS_M_S,
        carried: 0.9,
        light: lightOn([1, 1, 1]),
        clear: 0.75,
      },
      { count: MOST_GRAINS * falling.sand, speed: 0.3, carried: 1.2, light: lightOn([0.82, 0.68, 0.48]), clear: 0.45 },
    ];
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: view.target, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    kinds.forEach((kind, which) => {
      const count = Math.floor(kind.count);
      const uniform = this.uniforms[which];
      if (count < 1 || !uniform) return;
      const anchor = camera.eye.map((part) => ((part % FALL_BOX_M) + FALL_BOX_M) % FALL_BOX_M);
      const values = new Float32Array(FALL_FLOATS);
      values.set(camera.fromEye, 0);
      values.set([anchor[0] ?? 0, anchor[1] ?? 0, 0, time % 1024], 16);
      values.set([look.wind[0] * kind.carried, look.wind[1] * kind.carried, kind.speed, 0.07], 20);
      values.set([which, count, FALL_BOX_M, -camera.eye[2]], 24);
      values.set([...kind.light, kind.clear], 28);
      values.set([view.size[0], view.size[1], which === 0 ? 1.6 : 2.2, 0], 32);
      device.queue.writeBuffer(uniform, 0, values);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniform } },
            { binding: 1, resource: view.depth.createView() },
          ],
        }),
      );
      pass.draw(6, count);
    });
    pass.end();
  }
}
