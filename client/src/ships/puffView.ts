// A sea fight's see-through puffs on the GPU, after DFO's sprites (navalRender.js): each a soft round picture facing
// the eye, or lying flat on the water as a ring of foam, in premultiplied alpha, so one blend draws both kinds: smoke,
// spray and foam cover what is behind them by their alpha, and flash, flame, embers and glints add their light unlit
// (alpha none). They are drawn after the water, far to near, over the finished picture, hidden by hand where the
// scene's depth stands nearer, so the water's sky and surface never cover them. Each glow also gives its stepped halo
// through the light layer, as the land's bright things do.
import { NEAR_FADE_WGSL } from '../nearFade.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import type { Mark } from './effects.ts';
import type { ShipCamera } from './shipView.ts';

/** The most puffs drawn in a frame: past it the nearest wait. */
export const MOST_PUFFS = 2048;
/** A puff's floats: its place and radius, its colour and alpha, then whether it glows and whether it lies flat. */
const PUFF_FLOATS = 12;

/** What `puffFloats` writes into, kept from frame to frame by whoever draws the puffs: the floats of the most drawn,
 *  and each mark's distance and the marks' order, grown to the most marks yet seen. */
export class PuffScratch {
  readonly picture = new Float32Array(MOST_PUFFS * PUFF_FLOATS);
  readonly light = new Float32Array(MOST_PUFFS * PUFF_FLOATS);
  away = new Float64Array(0);
  order = new Uint32Array(0);
}

/** A puff's instance floats, written into `values` from `start` one at a time: a list made for them would be one a
 *  puff a frame. */
function putPuff(values: Float32Array, start: number, mark: Mark): void {
  values[start] = mark.x;
  values[start + 1] = mark.y;
  values[start + 2] = mark.z;
  values[start + 3] = mark.radius;
  values[start + 4] = mark.colour[0];
  values[start + 5] = mark.colour[1];
  values[start + 6] = mark.colour[2];
  values[start + 7] = mark.alpha ?? 1;
  values[start + 8] = mark.blend === 'smoke' ? 0 : 1;
  values[start + 9] = mark.flat ? 1 : 0;
  values[start + 10] = 0;
  values[start + 11] = 0;
}

/** The puffs to draw, far to near from `eye`, as their instance floats, and the glows' halos for the light pass, in
 *  `kept`'s arrays: good until the next call given them. */
export function puffFloats(
  marks: readonly Mark[],
  eye: readonly number[],
  kept: PuffScratch = new PuffScratch(),
): { picture: Float32Array; light: Float32Array } {
  if (kept.order.length < marks.length) {
    const room = 2 ** Math.ceil(Math.log2(marks.length));
    [kept.away, kept.order] = [new Float64Array(room), new Uint32Array(room)];
  }
  const { away, order } = kept;
  let [drawn, glows] = [0, 0];
  for (let index = 0; index < marks.length; index++) {
    const mark = marks[index] as Mark;
    if (mark.blend === 'glow') glows += 1;
    if (mark.blend !== 'smoke' && mark.blend !== 'glow') continue;
    away[index] = Math.hypot(mark.x - (eye[0] ?? 0), mark.y - (eye[1] ?? 0), mark.z - (eye[2] ?? 0));
    order[drawn] = index;
    drawn += 1;
  }
  // Far to near, two as far in the order given; past the most drawn, the farthest go, so the last are kept.
  const sorted = order.subarray(0, drawn).sort((one, other) => (away[other] ?? 0) - (away[one] ?? 0) || one - other);
  const first = Math.max(0, drawn - MOST_PUFFS);
  for (let nth = first; nth < drawn; nth++)
    putPuff(kept.picture, (nth - first) * PUFF_FLOATS, marks[sorted[nth] ?? 0] as Mark);
  // shortcut: a `light` mark (a muzzle's or a fire's reach, DFO's point light on the hulls near) is not drawn: the light
  // layer halos the screen round what glows, so a 26 m reach became a banded disc over the sky and sea. Upgrade when
  // the ships' shader takes point lights.
  let [glow, lit] = [0, 0];
  for (const mark of marks) {
    if (mark.blend !== 'glow') continue;
    glow += 1;
    if (glow > glows - MOST_PUFFS) putPuff(kept.light, lit++ * PUFF_FLOATS, mark);
  }
  return {
    picture: kept.picture.subarray(0, (drawn - first) * PUFF_FLOATS),
    light: kept.light.subarray(0, lit * PUFF_FLOATS),
  };
}

export const PUFF_WGSL = /* wgsl */ `
struct Camera { from_eye: mat4x4f, eye: vec4f }
@group(0) @binding(0) var<uniform> camera: Camera;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) colour: vec4f,
  @location(1) corner: vec2f,
  @location(2) @interpolate(flat) kind: vec2f,
  // How much shows as the eye comes to it: in or against a puff it would be a sheet over the whole view.
  @location(3) @interpolate(flat) near: f32,
}
${NEAR_FADE_WGSL}
const CORNERS = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));

@vertex fn puff_vertex(
  @builtin(vertex_index) index: u32,
  @location(0) place: vec4f,
  @location(1) colour: vec4f,
  @location(2) kind: vec4f,
) -> Out {
  let corner = CORNERS[index];
  let from_eye = place.xyz - camera.eye.xyz;
  // Facing the eye, upright as the eye stands; a flat one lies on the water.
  let forward = normalize(from_eye);
  var right = cross(forward, vec3f(0.0, 0.0, 1.0));
  right = select(vec3f(1.0, 0.0, 0.0), normalize(right), length(right) > 1e-4);
  var up = cross(right, forward);
  if (kind.y > 0.5) { right = vec3f(1.0, 0.0, 0.0); up = vec3f(0.0, 1.0, 0.0); }
  var out: Out;
  out.position = camera.from_eye * vec4f(from_eye + (right * corner.x + up * corner.y) * place.w, 1.0);
  out.colour = colour;
  out.corner = corner;
  out.kind = kind.xy;
  out.near = near_fade(length(from_eye) - place.w);
  return out;
}

// How much a puff covers at a share of its radius out: a soft round body, or a ring of foam.
fn cover(corner: vec2f, flat: f32) -> f32 {
  let out = length(corner);
  if (flat > 0.5) { return smoothstep(0.3, 0.72, out) * (1.0 - smoothstep(0.78, 1.0, out)); }
  let body = 1.0 - smoothstep(0.15, 1.0, out);
  return body * body;
}

@group(0) @binding(1) var depths: texture_2d<f32>;

@fragment fn puff_fragment(in: Out) -> @location(0) vec4f {
  if (in.position.z < textureLoad(depths, vec2i(in.position.xy), 0).r) { discard; }
  let alpha = cover(in.corner, in.kind.y) * in.colour.a * in.near;
  if (alpha <= 0.002) { discard; }
  // Premultiplied: a glow adds its light and covers nothing.
  return vec4f(in.colour.rgb * alpha, select(alpha, 0.0, in.kind.x > 0.5));
}

// The light a glow or a light gives, its colour already the light's: brightest at its middle and none at its reach.
@fragment fn light_fragment(in: Out) -> @location(0) vec4f {
  let out = 1.0 - min(1.0, length(in.corner));
  return vec4f(in.colour.rgb * out * out * in.colour.a, 0.0);
}
`;

/** The light layer's target and depth (combat/lightLayer.ts LIGHT_TARGET, LIGHT_DEPTH; the ships' layer may not
 *  import it): each light added, tested against the scene's reversed depth and never written. */
const ADD = { srcFactor: 'one', dstFactor: 'one', operation: 'add' } as const;
const LIGHT_TARGET: GPUColorTargetState = { format: 'rgba8unorm', blend: { color: ADD, alpha: ADD } };
const LIGHT_DEPTH: GPUDepthStencilState = {
  format: 'depth32float',
  depthWriteEnabled: false,
  depthCompare: 'greater-equal',
};
const BLENDED = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
const INSTANCES: GPUVertexBufferLayout = {
  arrayStride: PUFF_FLOATS * 4,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x4' },
    { shaderLocation: 1, offset: 16, format: 'float32x4' },
    { shaderLocation: 2, offset: 32, format: 'float32x4' },
  ],
};

/** Draws the puffs a `MarkView` set aside in its frame: over the picture after the water, and their light. */
export class PuffView {
  private readonly gpu: Gpu;
  private readonly over: GPURenderPipeline;
  private readonly lit: GPURenderPipeline;
  private readonly layout: GPUBindGroupLayout;
  private readonly camera: GPUBuffer;
  private readonly picture: GPUBuffer;
  private readonly light: GPUBuffer;
  private readonly lightGroup: GPUBindGroup;
  private group: { depth: GPUTexture; group: GPUBindGroup } | null = null;
  private counts = { picture: 0, light: 0 };
  private readonly kept = new PuffScratch();
  private readonly cameraValues = new Float32Array(20);

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device, format } = gpu;
    const module = device.createShaderModule({ code: PUFF_WGSL });
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const lightLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} }],
    });
    const vertex = { module, entryPoint: 'puff_vertex', buffers: [INSTANCES] };
    this.over = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex,
      fragment: {
        module,
        entryPoint: 'puff_fragment',
        targets: [{ format, blend: { color: BLENDED, alpha: BLENDED } }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.lit = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [lightLayout] }),
      vertex,
      fragment: { module, entryPoint: 'light_fragment', targets: [LIGHT_TARGET] },
      primitive: { topology: 'triangle-list' },
      depthStencil: LIGHT_DEPTH,
    });
    const usage = BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination;
    this.camera = device.createBuffer({ size: 80, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.picture = device.createBuffer({ size: MOST_PUFFS * PUFF_FLOATS * 4, usage });
    this.light = device.createBuffer({ size: MOST_PUFFS * PUFF_FLOATS * 4, usage });
    this.lightGroup = device.createBindGroup({
      layout: lightLayout,
      entries: [{ binding: 0, resource: { buffer: this.camera } }],
    });
  }

  /** The puffs of this frame among `marks` (window metres), seen from `camera`. */
  set(marks: readonly Mark[], camera: ShipCamera): void {
    const { picture, light } = puffFloats(marks, camera.eye, this.kept);
    this.counts = { picture: picture.length / PUFF_FLOATS, light: light.length / PUFF_FLOATS };
    const { queue } = this.gpu.device;
    const values = this.cameraValues;
    values.set(camera.fromEye);
    [values[16], values[17], values[18]] = camera.eye;
    queue.writeBuffer(this.camera, 0, values);
    if (picture.length > 0) queue.writeBuffer(this.picture, 0, picture);
    if (light.length > 0) queue.writeBuffer(this.light, 0, light);
  }

  /** The puffs over a finished single-sampled picture `target`, hidden where `depth` (the scene's, one float a
   *  pixel, reversed) stands nearer. */
  drawOver(encoder: GPUCommandEncoder, target: GPUTextureView, depth: GPUTexture): void {
    if (this.counts.picture === 0) return;
    if (this.group?.depth !== depth)
      this.group = {
        depth,
        group: this.gpu.device.createBindGroup({
          layout: this.layout,
          entries: [
            { binding: 0, resource: { buffer: this.camera } },
            { binding: 1, resource: depth.createView() },
          ],
        }),
      };
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.over);
    pass.setBindGroup(0, this.group.group);
    pass.setVertexBuffer(0, this.picture);
    pass.draw(6, this.counts.picture);
    pass.end();
  }

  /** Each glow's and light's light, into the light layer's pass (`LightLayer.encode`). */
  drawLight(pass: GPURenderPassEncoder): void {
    if (this.counts.light === 0) return;
    pass.setPipeline(this.lit);
    pass.setBindGroup(0, this.lightGroup);
    pass.setVertexBuffer(0, this.light);
    pass.draw(6, this.counts.light);
  }
}
