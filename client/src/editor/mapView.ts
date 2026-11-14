import { BUFFER_USAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import type { Camera } from './camera.ts';
import { CELL_M, type CellRect, type LandMask } from './landMask.ts';

/** What one frame of the map shows besides the land. */
export interface MapScene {
  readonly camera: Camera;
  readonly gridStepM: number;
  readonly selected: number;
  readonly brushX: number;
  readonly brushY: number;
  /** Zero hides the brush. */
  readonly brushRadiusM: number;
}

/** One full-screen pass: the sea, each continent's colour, coasts, the grid, the frame's edge and the brush. */
const SHADER = /* wgsl */ `
struct View {
  centre: vec2f,
  viewport: vec2f,
  frame: vec2f,
  brush: vec2f,
  metres_per_pixel: f32,
  grid_step: f32,
  brush_radius: f32,
  selected: u32,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var land: texture_2d<u32>;

const SEA = vec3f(0.07, 0.16, 0.27);
const OUTSIDE = vec3f(0.05, 0.05, 0.06);
const PALETTE = array<vec3f, 10>(
  vec3f(0.07, 0.16, 0.27),
  vec3f(0.36, 0.62, 0.31), vec3f(0.80, 0.68, 0.36), vec3f(0.62, 0.78, 0.84),
  vec3f(0.62, 0.32, 0.24), vec3f(0.54, 0.47, 0.70), vec3f(0.25, 0.52, 0.42),
  vec3f(0.85, 0.52, 0.28), vec3f(0.44, 0.58, 0.20), vec3f(0.70, 0.45, 0.55),
);

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn label_at(world: vec2f) -> u32 {
  let size = vec2i(textureDimensions(land));
  let cell = vec2i(floor(world / ${CELL_M}.0));
  if (any(cell < vec2i(0)) || any(cell >= size)) { return 0u; }
  return textureLoad(land, cell, 0).r;
}

@fragment
fn fragment_main(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let step = view.metres_per_pixel;
  let world = view.centre + (pixel.xy - view.viewport * 0.5) * step;
  if (any(world < vec2f(0.0)) || any(world > view.frame)) {
    let edge = min(min(abs(world.x), abs(world.x - view.frame.x)), min(abs(world.y), abs(world.y - view.frame.y)));
    return vec4f(select(OUTSIDE, vec3f(0.85), edge < step * 1.5), 1.0);
  }
  let label = label_at(world);
  var colour = PALETTE[min(label, 9u)];
  if (label != 0u && view.selected != 0u && label != view.selected) { colour = mix(colour, SEA, 0.25); }

  let coast = label_at(world + vec2f(step, 0.0)) != label || label_at(world + vec2f(0.0, step)) != label;
  if (coast) { colour = select(vec3f(0.92, 0.94, 0.90), vec3f(1.0, 1.0, 0.6), label == view.selected || label_at(world + vec2f(step, 0.0)) == view.selected || label_at(world + vec2f(0.0, step)) == view.selected); }

  let along = abs(fract(world / view.grid_step + 0.5) - 0.5) * view.grid_step;
  if (min(along.x, along.y) < step * 0.5) { colour = mix(colour, vec3f(1.0), 0.18); }

  if (view.brush_radius > 0.0 && abs(distance(world, view.brush) - view.brush_radius) < step) {
    colour = vec3f(1.0);
  }
  return vec4f(colour, 1.0);
}
`;

/** Draws the painted land with WebGPU: one texture of labels, one full-screen pass. */
export class MapView {
  private readonly gpu: Gpu;
  private readonly mask: LandMask;
  private readonly texture: GPUTexture;
  private readonly uniforms: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly frameWidthM: number;
  private readonly frameHeightM: number;

  constructor(gpu: Gpu, mask: LandMask, frameWidthM: number, frameHeightM: number) {
    this.gpu = gpu;
    this.mask = mask;
    this.frameWidthM = frameWidthM;
    this.frameHeightM = frameHeightM;
    const { device } = gpu;
    this.texture = device.createTexture({
      size: [mask.width, mask.height],
      format: 'r8uint',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.uniforms = device.createBuffer({ size: 48, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    const module = device.createShaderModule({ code: SHADER });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex_main' },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.texture.createView() },
      ],
    });
    this.upload(null);
  }

  /** Sends changed cells to the GPU: a rectangle after a brush stroke, or everything when `rect` is null. */
  upload(rect: CellRect | null): void {
    const { left, top, right, bottom } = rect ?? { left: 0, top: 0, right: this.mask.width, bottom: this.mask.height };
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;
    const rows = new Uint8Array(width * height);
    for (let row = 0; row < height; row++) {
      const from = (top + row) * this.mask.width + left;
      rows.set(this.mask.cells.subarray(from, from + width), row * width);
    }
    this.gpu.device.queue.writeTexture(
      { texture: this.texture, origin: [left, top] },
      rows,
      { bytesPerRow: width, rowsPerImage: height },
      [width, height],
    );
  }

  /** Draws one frame into the canvas, `width` by `height` pixels. */
  draw(scene: MapScene, width: number, height: number): void {
    const values = new ArrayBuffer(48);
    const floats = new Float32Array(values);
    floats.set([scene.camera.centreX, scene.camera.centreY, width, height, this.frameWidthM, this.frameHeightM]);
    floats.set([scene.brushX, scene.brushY, scene.camera.metresPerPixel, scene.gridStepM, scene.brushRadiusM], 6);
    new Uint32Array(values)[11] = scene.selected;
    const { device, context } = this.gpu;
    device.queue.writeBuffer(this.uniforms, 0, values);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
