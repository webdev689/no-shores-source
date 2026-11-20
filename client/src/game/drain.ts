// In death the world drains to grey, and comes back in colour on respawn or on leaving. It is drawn into the scene's
// own picture, last, so the interface the game draws over it keeps its colour. The look is the page's old filter on
// the canvas, `grayscale(0.92) brightness(0.72) contrast(1.05)`, eased out over 1.4 s each way as CSS eased it.
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../gpu.ts';

/** How long the world takes to drain, or to come back, in seconds. */
export const DRAIN_S = 1.4;

/** The drain at its fullest: how grey, how bright and how much contrast. */
const FULL = { grey: 0.92, bright: 0.72, contrast: 1.05 } as const;

/** CSS's `ease-out`, `cubic-bezier(0, 0, 0.58, 1)`, at `time` from 0 to 1. */
export function easeOut(time: number): number {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  // Along the curve, its x is 1.74a² − 0.74a³, rising from 0 to 1: halve toward the a whose x is the time, then give
  // its y, 3a² − 2a³.
  let [low, high] = [0, 1];
  for (let step = 0; step < 24; step++) {
    const along = (low + high) / 2;
    if (1.74 * along * along - 0.74 * along ** 3 < time) low = along;
    else high = along;
  }
  const along = (low + high) / 2;
  return 3 * along * along - 2 * along ** 3;
}

/** The filter at `share` of the drain (0 none, 1 full), as CSS sets each function between none and its own. */
export function drainOf(share: number): { grey: number; bright: number; contrast: number } {
  return {
    grey: FULL.grey * share,
    bright: 1 + (FULL.bright - 1) * share,
    contrast: 1 + (FULL.contrast - 1) * share,
  };
}

/** How far the world is drained: toward full while the player is dead, back toward none once they are not. A turn
 *  mid-way starts from where it stands and takes the share of 1.4 s it has left to go, as CSS reverses a transition. */
export class Drain {
  private from = 0;
  private to = 0;
  private length = 0;
  private elapsed = 0;

  /** Drains toward grey while `dead`, else back toward colour. */
  toward(dead: boolean): void {
    const to = dead ? 1 : 0;
    if (to === this.to) return;
    this.from = this.share;
    this.to = to;
    this.length = DRAIN_S * Math.abs(to - this.from);
    this.elapsed = 0;
  }

  /** Moves on `seconds`. */
  step(seconds: number): void {
    this.elapsed += seconds;
  }

  /** How far the world is drained now, 0 to 1. */
  get share(): number {
    if (this.elapsed >= this.length) return this.to;
    return this.from + (this.to - this.from) * easeOut(this.elapsed / this.length);
  }
}

export const DRAIN_SHADER = /* wgsl */ `
struct Drain { grey: f32, bright: f32, contrast: f32, pad: f32 }
@group(0) @binding(0) var<uniform> drain: Drain;
@group(0) @binding(1) var picture: texture_2d<f32>;

@vertex fn drain_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// CSS's three functions in turn on the picture's stored values, each kept within 0 to 1 as a filter keeps them.
@fragment fn drain_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let colour = textureLoad(picture, vec2i(position.xy), 0).rgb;
  let luma = dot(colour, vec3f(0.2126, 0.7152, 0.0722));
  let grey = mix(colour, vec3f(luma), drain.grey);
  let bright = clamp(grey * drain.bright, vec3f(0.0), vec3f(1.0));
  let contrast = clamp((bright - 0.5) * drain.contrast + 0.5, vec3f(0.0), vec3f(1.0));
  return vec4f(contrast, 1.0);
}
`;

/** Draws the drain over a finished picture: copies it aside, then draws it back through the filter. */
export class DrainView {
  private readonly pipeline: GPURenderPipeline;
  private readonly uniform: GPUBuffer;
  private readonly gpu: Gpu;
  private held: { texture: GPUTexture; group: GPUBindGroup } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const module = gpu.device.createShaderModule({ code: DRAIN_SHADER });
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'drain_vertex' },
      fragment: { module, entryPoint: 'drain_fragment', targets: [{ format: gpu.format }] },
    });
    this.uniform = gpu.device.createBuffer({
      size: 16,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
  }

  /** Drains `target`, the picture as drawn, by `share`; at none it records nothing. */
  encode(encoder: GPUCommandEncoder, target: GPUTexture, share: number): void {
    if (share <= 0) return;
    const { grey, bright, contrast } = drainOf(Math.min(1, share));
    this.gpu.device.queue.writeBuffer(this.uniform, 0, new Float32Array([grey, bright, contrast, 0]));
    const held = this.heldFor(target);
    const size = [target.width, target.height];
    encoder.copyTextureToTexture({ texture: target }, { texture: held.texture }, size);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target.createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, held.group);
    pass.draw(3);
    pass.end();
  }

  /** The texture the picture is copied into, the target's size. */
  private heldFor(target: GPUTexture) {
    const was = this.held;
    if (was?.texture.width === target.width && was.texture.height === target.height) return was;
    was?.texture.destroy();
    const { device, format } = this.gpu;
    const texture = device.createTexture({
      size: [target.width, target.height],
      format,
      usage: TEXTURE_USAGE.copyDestination | TEXTURE_USAGE.textureBinding,
    });
    const group = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: texture.createView() },
      ],
    });
    this.held = { texture, group };
    return this.held;
  }
}
