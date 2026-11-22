import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE, type Gpu } from '../../gpu.ts';
import { type Atlas, BLOOD_ABSORB_ENCODED, BLOOD_BASE, INK_DEPTH, atlasCells, bloodSheet, dropletArt } from './art.ts';
import { GIB_COUNT } from './gibs.ts';
import { type BloodMarks, DROP_QUAD, GIB_QUAD, MAX_BODIES, MAX_FLYING } from './marks.ts';
import { FLOATS_PER_VERTEX, QUAD_FLOATS, type Tint, type Vector, quadIndices, writeQuad } from './spray.ts';

const SCENE_BYTES = 96;
const BILLBOARDS = MAX_FLYING + GIB_COUNT * MAX_BODIES;
const WHITE: Tint = [1, 1, 1, 1];
const CHUNK_TINT: Tint = [...BLOOD_BASE, 1];
/** A chunk wears the sheet's first spatter splat, as DFO's wears one frame of its splash. */
const CHUNK_CELL = atlasCells().find((cell) => cell.kind === 'spatter') ?? null;
const UPWARD: Vector = [0, 0, 1];
const float = (value: number): string => value.toFixed(6);

/** The camera as the scene draws from it: world to clip, the point its fog is measured from, the eye, and its right. */
export interface BloodCamera {
  readonly viewProjection: Float32Array;
  readonly focus: Vector;
  readonly eye: Vector;
  readonly right: Vector;
}

/** The sky the scene fogs into, the light its blocks take, and how it fogs: sceneView.ts's own. */
export const SHADER = /* wgsl */ `
struct Scene { viewProjection: mat4x4f, focus: vec4f, eye: vec4f }
@group(0) @binding(0) var<uniform> scene: Scene;
struct Art { picture: vec4f }
@group(1) @binding(0) var<uniform> art: Art;
@group(1) @binding(1) var sheet: texture_2d<f32>;
@group(1) @binding(2) var smoothly: sampler;

const SKY = vec3f(0.55, 0.66, 0.78);
const ABSORB = vec3f(${BLOOD_ABSORB_ENCODED.map(float).join(', ')});

struct MarkOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
  @location(2) world: vec3f,
}

@vertex fn markVertex(@location(0) position: vec3f, @location(1) uv: vec2f, @location(2) tint: vec4f) -> MarkOut {
  var out: MarkOut;
  out.position = scene.viewProjection * vec4f(position, 1.0);
  out.uv = uv;
  out.tint = tint;
  out.world = position;
  return out;
}

@fragment fn markFragment(in: MarkOut) -> @location(0) vec4f {
  let texel = textureSample(sheet, smoothly, in.uv);
  // The quad's own normal, from its derivatives, turned to face the eye.
  let crossed = cross(dpdx(in.world), dpdy(in.world));
  var normal = select(vec3f(0.0, 0.0, 1.0), normalize(crossed), dot(crossed, crossed) > 1e-12);
  if (dot(normal, scene.eye.xyz - in.world) < 0.0) { normal = -normal; }
  // Lit as what it lies on: the ground is drawn unlit, the blocks by one light.
  let light = normalize(vec3f(0.4, -0.3, 0.85));
  let shade = select(0.55 + 0.45 * max(dot(normal, light), 0.0), 1.0, in.world.z < 0.05);
  // A film: the ink is the thickness inverted, and a thinning rim glows toward orange (Beer-Lambert); a picture's
  // colour is its texel.
  let thick = texel.a * clamp((1.0 - texel.r) / ${float(INK_DEPTH)}, 0.0, 1.0);
  let film = in.tint.rgb * exp(ABSORB * (1.0 - thick));
  let colour = select(film, texel.rgb * in.tint.rgb, art.picture.x > 0.5) * shade;
  let fog = clamp(length(in.world.xy - scene.focus.xy) / 1200.0, 0.0, 1.0);
  if (texel.a < 0.01) { discard; }
  return vec4f(mix(colour, SKY, fog * fog), texel.a * in.tint.a);
}
`;

/**
 * Blood drawn in a page's scene, `samples` to a pixel: the ring of marks in one draw a range (oldest first, so the
 * newest lies on top), then the chunks and droplets in flight as upright billboards. Blended, tested against the
 * scene's depth and writing none, drawn before the figures so a body stands over its own blood.
 */
export class BloodView {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly sceneBuffer: GPUBuffer;
  private readonly sceneGroup: GPUBindGroup;
  private readonly sheetGroup: GPUBindGroup;
  private readonly dropletGroup: GPUBindGroup;
  private readonly ringBuffer: GPUBuffer;
  private readonly billboardBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  /** The sheet's and the droplet's pictures and their flags, let go with the rest. */
  private readonly art: (GPUTexture | GPUBuffer)[] = [];
  private readonly billboardFloats = new Float32Array(BILLBOARDS * QUAD_FLOATS);
  private ranges: [number, number][] = [];
  private chunks = 0;
  private droplets = 0;

  constructor(
    gpu: Gpu,
    capacity: number,
    depth: { readonly format: GPUTextureFormat; readonly compare: GPUCompareFunction },
    samples = 1,
  ) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    const sceneLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: both, buffer: {} }] });
    const artLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: {} },
        { binding: 2, visibility: SHADER_STAGE.fragment, sampler: {} },
      ],
    });
    const blended = { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, artLayout] }),
      vertex: {
        module,
        entryPoint: 'markVertex',
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x2' },
              { shaderLocation: 2, offset: 20, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'markFragment',
        targets: [{ format: gpu.format, blend: { color: blended, alpha: blended } }],
      },
      // A mark on a ceiling is seen from behind its own normal.
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: depth.format, depthWriteEnabled: false, depthCompare: depth.compare },
      multisample: { count: samples },
    });
    const buffer = (size: number, usage: number) =>
      device.createBuffer({ size, usage: usage | BUFFER_USAGE.copyDestination });
    this.sceneBuffer = buffer(SCENE_BYTES, BUFFER_USAGE.uniform);
    this.sceneGroup = device.createBindGroup({
      layout: sceneLayout,
      entries: [{ binding: 0, resource: { buffer: this.sceneBuffer } }],
    });
    this.ringBuffer = buffer(capacity * QUAD_FLOATS * 4, BUFFER_USAGE.vertex);
    this.billboardBuffer = buffer(this.billboardFloats.byteLength, BUFFER_USAGE.vertex);
    const indices = quadIndices(Math.max(capacity, BILLBOARDS));
    this.indexBuffer = buffer(indices.byteLength, BUFFER_USAGE.index);
    device.queue.writeBuffer(this.indexBuffer, 0, indices);
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const artGroup = (art: Atlas, picture: number): GPUBindGroup => {
      const texture = device.createTexture({
        size: [art.width, art.height],
        format: 'rgba8unorm',
        usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
      });
      device.queue.writeTexture({ texture }, art.colours, { bytesPerRow: art.width * 4 }, [art.width, art.height]);
      const flag = buffer(16, BUFFER_USAGE.uniform);
      device.queue.writeBuffer(flag, 0, new Float32Array([picture, 0, 0, 0]));
      this.art.push(texture, flag);
      return device.createBindGroup({
        layout: artLayout,
        entries: [
          { binding: 0, resource: { buffer: flag } },
          { binding: 1, resource: texture.createView() },
          { binding: 2, resource: sampler },
        ],
      });
    };
    this.sheetGroup = artGroup(bloodSheet(), 0);
    this.dropletGroup = artGroup(dropletArt(), 1);
  }

  /** Takes this frame's blood: the ring's changed slots, the camera, and the chunks and droplets where they are. */
  update(marks: BloodMarks, camera: BloodCamera): void {
    const { queue } = this.gpu.device;
    for (const run of marks.takeRuns()) queue.writeBuffer(this.ringBuffer, run.slot * QUAD_FLOATS * 4, run.floats);
    this.ranges = marks.ring.ranges();
    const values = new Float32Array(SCENE_BYTES / 4);
    values.set(camera.viewProjection);
    values.set([...camera.focus, 0], 16);
    values.set([...camera.eye, 0], 20);
    queue.writeBuffer(this.sceneBuffer, 0, values);
    const level = Math.hypot(camera.right[0], camera.right[1]) || 1;
    const right: Vector = [camera.right[0] / level, camera.right[1] / level, 0];
    const billboard = (index: number, position: Vector, size: number, tint: Tint, cell = CHUNK_CELL) =>
      writeQuad(this.billboardFloats, index * QUAD_FLOATS, {
        position,
        right,
        up: UPWARD,
        size,
        stretch: 1,
        tint,
        uv: cell,
      });
    this.chunks = Math.min(marks.gibs.length, GIB_COUNT * MAX_BODIES);
    marks.gibs.slice(0, this.chunks).forEach((gib, index) => billboard(index, gib.position, GIB_QUAD, CHUNK_TINT));
    this.droplets = Math.min(marks.flying.length, MAX_FLYING);
    const full = { kind: 'droplet', u0: 0, v0: 0, u1: 1, v1: 1 };
    marks.flying
      .slice(0, this.droplets)
      .forEach((drop, index) => billboard(this.chunks + index, drop.position, DROP_QUAD, WHITE, full));
    const used = (this.chunks + this.droplets) * QUAD_FLOATS;
    if (used > 0) queue.writeBuffer(this.billboardBuffer, 0, this.billboardFloats.subarray(0, used));
  }

  /** Lets go of the blood's buffers and pictures; it draws nothing after. */
  destroy(): void {
    for (const buffer of [this.sceneBuffer, this.ringBuffer, this.billboardBuffer, this.indexBuffer]) buffer.destroy();
    for (const held of this.art.splice(0)) held.destroy();
    this.ranges = [];
    [this.chunks, this.droplets] = [0, 0];
  }

  /** Records the blood's draws into the scene's pass. */
  draw(pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.sceneGroup);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.setBindGroup(1, this.sheetGroup);
    pass.setVertexBuffer(0, this.ringBuffer);
    for (const [first, end] of this.ranges) pass.drawIndexed((end - first) * 6, 1, first * 6);
    pass.setVertexBuffer(0, this.billboardBuffer);
    if (this.chunks > 0) pass.drawIndexed(this.chunks * 6);
    pass.setBindGroup(1, this.dropletGroup);
    if (this.droplets > 0) pass.drawIndexed(this.droplets * 6, 1, this.chunks * 6);
  }
}
