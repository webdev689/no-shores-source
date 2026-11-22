// A waking eye's blur over the world: drawn into the scene's own picture, last but the drain, so the interface the game
// draws over it stays sharp. The look is the page's old filter on the canvas, `blur(Npx)`: a Gaussian whose standard
// deviation is N CSS pixels, taken across and then down. Past the picture's edge it takes the edge's own colour, where
// the page's filter faded to what lay under the canvas.
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../gpu.ts';

/** The most device pixels a blur reaches, its weights past three deviations too small to see. */
export const BLUR_REACH_MOST = 96;

/** How many device pixels each side of a pixel a blur of deviation `sigma` (device pixels) takes in. */
export const blurReach = (sigma: number): number => Math.min(BLUR_REACH_MOST, Math.ceil(3 * sigma));

export const BLUR_SHADER = /* wgsl */ `
struct Blur { sigma: f32, reach: f32, across: f32, down: f32 }
@group(0) @binding(0) var<uniform> blur: Blur;
@group(0) @binding(1) var picture: texture_2d<f32>;

@vertex fn blur_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// One way of the two: the pixels along it weighed by the Gaussian, kept to the picture at its edges.
@fragment fn blur_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(picture));
  let here = vec2i(position.xy);
  let step = vec2i(i32(blur.across), i32(blur.down));
  let reach = i32(blur.reach);
  var sum = vec3f(0.0);
  var weights = 0.0;
  for (var offset = -reach; offset <= reach; offset++) {
    let at = clamp(here + step * offset, vec2i(0), size - 1);
    let weight = exp(-f32(offset * offset) / (2.0 * blur.sigma * blur.sigma));
    sum += textureLoad(picture, at, 0).rgb * weight;
    weights += weight;
  }
  return vec4f(sum / weights, 1.0);
}
`;

interface Held {
  readonly picture: GPUTexture;
  readonly across: GPUTexture;
  readonly first: GPUBindGroup;
  readonly second: GPUBindGroup;
}

/** Draws the blur over a finished picture: copies it aside, blurs it across into a texture of its own, then down back
 *  into the picture. */
export class BlurView {
  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: readonly [GPUBuffer, GPUBuffer];
  private readonly gpu: Gpu;
  private held: Held | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const module = gpu.device.createShaderModule({ code: BLUR_SHADER });
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'blur_vertex' },
      fragment: { module, entryPoint: 'blur_fragment', targets: [{ format: gpu.format }] },
    });
    const uniform = () =>
      gpu.device.createBuffer({ size: 16, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.uniforms = [uniform(), uniform()];
  }

  /** Blurs `target`, the picture as drawn, by a deviation of `sigma` device pixels; under half a pixel, not at all. */
  encode(encoder: GPUCommandEncoder, target: GPUTexture, sigma: number): void {
    if (sigma < 0.5) return;
    const reach = blurReach(sigma);
    const { queue } = this.gpu.device;
    queue.writeBuffer(this.uniforms[0], 0, new Float32Array([sigma, reach, 1, 0]));
    queue.writeBuffer(this.uniforms[1], 0, new Float32Array([sigma, reach, 0, 1]));
    const held = this.heldFor(target);
    encoder.copyTextureToTexture({ texture: target }, { texture: held.picture }, [target.width, target.height]);
    for (const [into, group] of [
      [held.across, held.first],
      [target, held.second],
    ] as const) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: into.createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    }
  }

  /** The textures the picture is copied and blurred across into, the target's size. */
  private heldFor(target: GPUTexture): Held {
    const was = this.held;
    if (was?.picture.width === target.width && was.picture.height === target.height) return was;
    was?.picture.destroy();
    was?.across.destroy();
    const { device, format } = this.gpu;
    const texture = (usage: number) => device.createTexture({ size: [target.width, target.height], format, usage });
    const picture = texture(TEXTURE_USAGE.copyDestination | TEXTURE_USAGE.textureBinding);
    const across = texture(TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding);
    const group = (uniform: GPUBuffer, from: GPUTexture) =>
      device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniform } },
          { binding: 1, resource: from.createView() },
        ],
      });
    this.held = {
      picture,
      across,
      first: group(this.uniforms[0], picture),
      second: group(this.uniforms[1], across),
    };
    return this.held;
  }
}
