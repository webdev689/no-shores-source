// A guild's banner cloth hung in the world from its standard's `cloth` socket: its pixels (`bannerArt.ts`) laid on a
// grid that hangs down from the socket, facing as the standard faces, its fly stirring in a running wave that grows
// toward its foot, as the ships' flags stir. A cell the cut takes away is not drawn.
import { REVERSED_DEPTH } from '../../editor/orbit.ts';
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../../gpu.ts';
import { SAMPLES } from '../../water/waterView.ts';
import { CLOTH_HEIGHT, CLOTH_WIDTH, bannerKey, clothPixels } from './bannerArt.ts';
import type { Banner } from './bannerLaw.ts';

/** A cloth hung: the middle of its top edge (world metres), its turn clockwise from north, and its banner. */
export interface Hung {
  readonly at: readonly [number, number, number];
  readonly turn: number;
  readonly banner: Banner;
}

/** The cloth's width, metres: its height keeps the picture's shape. */
const WIDTH_M = 1.1;
/** How often the wave comes round, seconds (its phase runs 1.6 a second): the shader's clock wraps at a whole number
 *  of them, so the cloth never jumps. */
const WAVE_PERIOD_S = ((2 * Math.PI) / 1.6) * 256;
/** Its grid's cells across and down. */
const [ACROSS, DOWN] = [6, 12];

export const CLOTH_SHADER = /* wgsl */ `
struct View { from_eye: mat4x4f, origin: vec4f, size: vec4f }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var cloth: texture_2d<f32>;
@group(0) @binding(2) var nearest: sampler;

struct Out { @builtin(position) clip: vec4f, @location(0) uv: vec2f, @location(1) normal: vec3f, @location(2) fold: f32 }

@vertex fn cloth_vertex(@builtin(vertex_index) index: u32) -> Out {
  let corners = array<vec2u, 6>(vec2u(0, 0), vec2u(1, 0), vec2u(0, 1), vec2u(1, 0), vec2u(1, 1), vec2u(0, 1));
  let cell = index / 6u;
  let corner = corners[index % 6u] + vec2u(cell % ${ACROSS}u, cell / ${ACROSS}u);
  let uv = vec2f(f32(corner.x) / ${ACROSS}.0, f32(corner.y) / ${DOWN}.0);
  let width = view.size.x;
  let height = view.size.y;
  let time = view.size.z;
  // The wave runs down and across the cloth, standing out further toward its foot; seen from before the cloth that
  // shows only in its folds' light, so the whole cloth also sways about its top, its foot furthest.
  let phase = uv.x * 3.0 + uv.y * 4.0 - time * 1.6;
  let reach = 0.12 * width * (0.25 + uv.y);
  let sway = sin(time * 0.9 + uv.y * 1.5) * 0.1 * width * uv.y * uv.y;
  let local = vec3f((uv.x - 0.5) * width + sway, sin(phase) * reach, -uv.y * height);
  let slope = cos(phase) * reach;
  let facing = normalize(vec3f(-slope * 3.0 / width, 1.0, slope * 4.0 / height));
  let turn = vec2f(cos(view.origin.w), sin(view.origin.w));
  let turned = vec3f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x, local.z);
  var out: Out;
  out.clip = view.from_eye * vec4f(turned + view.origin.xyz, 1.0);
  out.uv = uv;
  out.fold = cos(phase) * (0.25 + uv.y);
  out.normal = vec3f(facing.x * turn.x - facing.y * turn.y, facing.x * turn.y + facing.y * turn.x, facing.z);
  return out;
}

@fragment fn cloth_fragment(in: Out) -> @location(0) vec4f {
  let texel = textureSample(cloth, nearest, in.uv);
  if texel.a < 0.5 { discard; }
  // Each fold's crest lit and its trough shadowed, the bands running down the cloth with the wave.
  let lit = 0.62 + 0.38 * abs(dot(normalize(in.normal), normalize(vec3f(0.4, 0.55, 0.75))));
  let shade = lit * (0.85 + 0.2 * in.fold);
  return vec4f(texel.rgb * shade, 1.0);
}
`;

/** Draws the one cloth hung where the player stands, if any. */
export class BannerCloth {
  private readonly gpu: Gpu;
  private pipeline: GPURenderPipeline | null = null;
  private readonly view: GPUBuffer;
  private readonly texture: GPUTexture;
  private group: GPUBindGroup | null = null;
  private hung: Hung | null = null;
  private key = '';
  private readonly numbers = new Float32Array(24);

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    this.view = device.createBuffer({ size: 96, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.texture = device.createTexture({
      size: [CLOTH_WIDTH, CLOTH_HEIGHT],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
  }

  /** The cloth the next frames draw; none for no standard here. */
  set(hung: Hung | null): void {
    this.hung = hung;
    const key = hung ? bannerKey(hung.banner) : '';
    if (!hung || key === this.key) return;
    this.key = key;
    const pixels = clothPixels(hung.banner);
    this.gpu.device.queue.writeTexture({ texture: this.texture }, pixels, { bytesPerRow: CLOTH_WIDTH * 4 }, [
      CLOTH_WIDTH,
      CLOTH_HEIGHT,
    ]);
  }

  /** The pipeline and its bind group, made the first frame a cloth is drawn. */
  private made(): { pipeline: GPURenderPipeline; group: GPUBindGroup } {
    if (this.pipeline && this.group) return { pipeline: this.pipeline, group: this.group };
    const { device, format } = this.gpu;
    const module = device.createShaderModule({ code: CLOTH_SHADER });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'cloth_vertex' },
      fragment: { module, entryPoint: 'cloth_fragment', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: true, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.view } },
        { binding: 1, resource: this.texture.createView() },
        { binding: 2, resource: device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' }) },
      ],
    });
    [this.pipeline, this.group] = [pipeline, group];
    return { pipeline, group };
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, eye: readonly number[], time: number): void {
    const { hung, numbers } = this;
    if (!hung) return;
    numbers.set(fromEye.subarray(0, 16));
    numbers.set([hung.at[0] - (eye[0] ?? 0), hung.at[1] - (eye[1] ?? 0), hung.at[2] - (eye[2] ?? 0), hung.turn], 16);
    numbers.set([WIDTH_M, (WIDTH_M * CLOTH_HEIGHT) / CLOTH_WIDTH, time % WAVE_PERIOD_S, 0], 20);
    this.gpu.device.queue.writeBuffer(this.view, 0, numbers);
    const { pipeline, group } = this.made();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(ACROSS * DOWN * 6);
  }
}
