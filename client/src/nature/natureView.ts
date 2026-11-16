import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { SLOW_CLOCK_S } from '../water/shore.ts';
import { SAMPLES } from '../water/waterView.ts';
import { runsInView, tilesInView } from './cull.ts';
import { INSTANCE_FLOATS, NatureField, type NatureGround, type Packed } from './field.ts';
import { FORM_BLOCK_BYTES, type FormBuffers, formBuffers, type Part, VERTEX_BYTES } from './forms.ts';
import { type Cast, TREE } from './kinds.ts';
import { FRAME_FLOATS, NATURE_SHADER } from './natureShader.ts';

/** The camera a frame is drawn from. */
export interface NatureFrame {
  /** The view-projection of points measured from the eye, depth reversed (orbit.ts viewProjection). */
  readonly fromEye: Float32Array;
  /** The eye: metres east and south in the world, and its height as drawn (times the exaggeration). */
  readonly eye: readonly [number, number, number];
  /** Heights are drawn times this; 1 in the game. */
  readonly exaggeration: number;
  /** Seconds, for the wind. */
  readonly time: number;
  /** The way the wind blows (east, south), a unit vector; a steady breeze from the west-south-west without one. */
  readonly wind?: readonly [number, number];
}

const DEFAULT_WIND = [0.8, -0.6] as const;
/** How much higher than the plants' reach the eye may stand over the ground below before nothing is drawn, metres. */
const HIGH_MARGIN_M = 2000;
const GUST_PER_M = 0.035;
/** The plants' faces wound counter-clockwise outward in the world (x east, y south, z up) reach the screen
 *  clockwise, its y flipped against the world's south: the view's frame is mirrored. */
const FRONT_FACE: GPUFrontFace = 'cw';

/** One draw: a part, its block's offset and a run of instances. */
interface Draw {
  readonly part: Part;
  readonly first: number;
  readonly count: number;
}

/**
 * The trees, plants and rocks round the eye, drawn with WebGPU into the land's pass, after the land and before the
 * water, which hazes them with the rest. Each frame: `update` with the camera and the ground, then `drawInto` the
 * pass the land is drawn into.
 */
export class NatureView {
  private readonly gpu: Gpu;
  private readonly field: NatureField;
  private readonly layout: GPUBindGroupLayout;
  private readonly pipelines: { readonly culled: GPURenderPipeline; readonly twoSided: GPURenderPipeline };
  private readonly frameBuffer: GPUBuffer;
  private meshes: {
    cast: Cast;
    forms: FormBuffers;
    vertices: GPUBuffer;
    blocks: GPUBuffer;
    bind: GPUBindGroup;
  } | null = null;
  private instances: { packed: Packed; buffer: GPUBuffer | null } | null = null;
  private visible = new Uint8Array();
  private draws: Draw[] = [];

  /** `budgetMs` is how long one update may spend scattering newly near tiles. */
  constructor(gpu: Gpu, budgetMs = 6) {
    this.gpu = gpu;
    this.field = new NatureField(budgetMs);
    const { device } = gpu;
    const seen = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: seen, buffer: { type: 'uniform' } },
        { binding: 1, visibility: seen, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 32 } },
      ],
    });
    const module = device.createShaderModule({ code: NATURE_SHADER });
    const pipeline = (cullMode: GPUCullMode) =>
      device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
        vertex: {
          module,
          entryPoint: 'plant_vertex',
          buffers: [
            {
              arrayStride: VERTEX_BYTES,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
                { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
              ],
            },
            {
              arrayStride: INSTANCE_FLOATS * 4,
              stepMode: 'instance',
              attributes: [
                { shaderLocation: 3, offset: 0, format: 'float32x4' },
                { shaderLocation: 4, offset: 16, format: 'float32x4' },
              ],
            },
          ],
        },
        fragment: { module, entryPoint: 'plant_fragment', targets: [{ format: gpu.format }] },
        primitive: { topology: 'triangle-list', cullMode, frontFace: FRONT_FACE },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
        multisample: { count: SAMPLES },
      });
    this.pipelines = { culled: pipeline('back'), twoSided: pipeline('none') };
    this.frameBuffer = device.createBuffer({
      size: FRAME_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
  }

  /** Keeps the plants round the eye and works out what this frame draws. Answers whether tiles are still waiting
   *  to be scattered, so a page that draws only when asked draws again. */
  update(frame: NatureFrame, ground: NatureGround): boolean {
    // From high above, every plant is past its reach: nothing is drawn and nothing scattered. The margin keeps the
    // plants on a ridge in view from high over the valley beside it.
    const below = ground.sample(frame.eye[0], frame.eye[1]).height * frame.exaggeration;
    if (frame.eye[2] - below > TREE.reachM + HIGH_MARGIN_M) {
      this.draws = [];
      return false;
    }
    const waiting = this.field.update(frame.eye[0], frame.eye[1], ground);
    this.keepMeshes(this.field.drawnCast);
    const packed = this.field.packed;
    if (this.instances?.packed !== packed) this.upload(packed);
    const [eastFromAnchor, southFromAnchor] = [packed.anchor[0] - frame.eye[0], packed.anchor[1] - frame.eye[1]];
    const wind = frame.wind ?? DEFAULT_WIND;
    const gusts = ((packed.anchor[0] * wind[0] + packed.anchor[1] * wind[1]) * GUST_PER_M) % (Math.PI * 2);
    const floats = new Float32Array(FRAME_FLOATS);
    floats.set(frame.fromEye);
    floats.set([eastFromAnchor, southFromAnchor, -frame.eye[2], frame.exaggeration], 16);
    floats.set([frame.time % SLOW_CLOCK_S, wind[0], wind[1], gusts], 20);
    floats.set([ground.snowM, 0, 0, 0], 24);
    this.gpu.device.queue.writeBuffer(this.frameBuffer, 0, floats);
    const anchorFromEye = [eastFromAnchor, southFromAnchor, -frame.eye[2]] as const;
    if (this.visible.length !== packed.tiles.length / 4) this.visible = new Uint8Array(packed.tiles.length / 4);
    tilesInView(packed, frame.fromEye, anchorFromEye, frame.exaggeration, this.visible);
    this.draws = [];
    const parts = this.meshes?.forms.parts ?? [];
    for (const group of packed.groups) {
      const part = parts[group.form]?.[group.far ? 1 : 0];
      if (!part) continue;
      const runs = runsInView(group, this.visible);
      for (let run = 0; run < runs.length; run += 2) {
        this.draws.push({ part, first: runs[run] ?? 0, count: runs[run + 1] ?? 0 });
      }
    }
    return waiting;
  }

  /** How many instances and triangles the last update drew, for a page's readout. */
  get drawn(): { readonly instances: number; readonly triangles: number; readonly draws: number } {
    let [instances, triangles] = [0, 0];
    for (const { part, count } of this.draws) {
      instances += count;
      triangles += (part.vertexCount / 3) * count;
    }
    return { instances, triangles, draws: this.draws.length };
  }

  /** Draws into the land's pass (four samples, depth reversed) what `update` worked out. */
  drawInto(pass: GPURenderPassEncoder): void {
    const meshes = this.meshes;
    const instances = this.instances?.buffer;
    if (!meshes || !instances || this.draws.length === 0) return;
    pass.setVertexBuffer(0, meshes.vertices);
    pass.setVertexBuffer(1, instances);
    let shown: GPURenderPipeline | null = null;
    for (const { part, first, count } of this.draws) {
      const pipeline = part.twoSided ? this.pipelines.twoSided : this.pipelines.culled;
      if (pipeline !== shown) pass.setPipeline((shown = pipeline));
      pass.setBindGroup(0, meshes.bind, [part.block * FORM_BLOCK_BYTES]);
      pass.draw(part.vertexCount, count, part.firstVertex, first);
    }
  }

  /** Gives the GPU back this view's buffers; it draws nothing after. */
  destroy(): void {
    this.frameBuffer.destroy();
    this.meshes?.vertices.destroy();
    this.meshes?.blocks.destroy();
    this.instances?.buffer?.destroy();
    [this.meshes, this.instances, this.draws] = [null, null, []];
  }

  /** The cast's meshes and terms on the GPU, made again when the biome changes. */
  private keepMeshes(cast: Cast): void {
    if (this.meshes?.cast === cast) return;
    this.meshes?.vertices.destroy();
    this.meshes?.blocks.destroy();
    const { device } = this.gpu;
    const forms = formBuffers(cast);
    const vertices = device.createBuffer({
      size: Math.max(4, forms.vertices.byteLength),
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(vertices, 0, forms.vertices);
    const blocks = device.createBuffer({
      size: Math.max(FORM_BLOCK_BYTES, forms.blocks.byteLength),
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(blocks, 0, forms.blocks);
    const bind = device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: { buffer: blocks, size: 32 } },
      ],
    });
    this.meshes = { cast, forms, vertices, blocks, bind };
  }

  /** Sends the packed instances to the GPU, in a buffer grown by halves so the eye's steps rarely make a new one. */
  private upload(packed: Packed): void {
    const bytes = packed.instances.byteLength;
    let buffer = this.instances?.buffer ?? null;
    if (bytes > 0 && (!buffer || buffer.size < bytes)) {
      buffer?.destroy();
      buffer = this.gpu.device.createBuffer({
        size: Math.ceil((bytes * 1.5) / 256) * 256,
        usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
      });
    }
    if (buffer && bytes > 0) this.gpu.device.queue.writeBuffer(buffer, 0, packed.instances);
    this.instances = { packed, buffer };
  }
}
