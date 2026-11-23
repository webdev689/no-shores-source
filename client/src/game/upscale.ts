// The scene's picture, drawn smaller than the canvas at the chosen resolution, stretched over the whole canvas, each of
// the canvas's pixels blended from the four nearest of the picture's. The hands and the interface draw over it after,
// at the canvas's own size.
import type { Gpu } from '../gpu.ts';

export const UPSCALE = /* wgsl */ `
@group(0) @binding(0) var picture: texture_2d<f32>;
@group(0) @binding(1) var blended: sampler;
struct Corner { @builtin(position) position: vec4f, @location(0) along: vec2f }
@vertex fn upscale_vertex(@builtin(vertex_index) index: u32) -> Corner {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return Corner(vec4f(corner * 2.0 - 1.0, 0.0, 1.0), vec2f(corner.x, 1.0 - corner.y));
}
@fragment fn upscale_fragment(@location(0) along: vec2f) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(picture, blended, along, 0.0).rgb, 1.0);
}
`;

export class Upscale {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  /** The bind group reading the picture, made again when it is another texture. */
  private bound: { picture: GPUTexture; group: GPUBindGroup } | null = null;

  constructor(gpu: Gpu) {
    this.device = gpu.device;
    const module = gpu.device.createShaderModule({ code: UPSCALE });
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'upscale_vertex' },
      fragment: { module, entryPoint: 'upscale_fragment', targets: [{ format: gpu.format }] },
    });
    this.sampler = gpu.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  }

  /** Draws `picture` over the whole of `target`. */
  encode(encoder: GPUCommandEncoder, picture: GPUTexture, target: GPUTextureView): void {
    if (this.bound?.picture !== picture) {
      const group = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: picture.createView() },
          { binding: 1, resource: this.sampler },
        ],
      });
      this.bound = { picture, group };
    }
    // Every pixel is drawn, so nothing of the canvas is kept.
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bound.group);
    pass.draw(3);
    pass.end();
  }
}
