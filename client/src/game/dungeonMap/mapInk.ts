// The dungeon map's GPU side: the dungeon's own mesh, the buffers its view already holds, drawn by the map's two
// passes (`mapShaders.ts`) on the game's device, over the finished picture.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE, viewOf } from '../../gpu.ts';
import type { MapView } from './mapCamera.ts';
import { MAP_FACES_SHADER, MAP_FLOATS, MAP_INK_SHADER } from './mapShaders.ts';

/** The ink's measures, our own: the cut over the floor looked at (m), full ink to this far under it (m), fading over
 *  the next (m) to the least; a storey not looked at's strength when all show; the depth's range (m); and the compass's
 *  radius and its gap from the paper's corner (CSS px). */
export const INK = {
  cutOver: 2.6,
  fadeFrom: 2,
  fadeOver: 8,
  fadeLeast: 0.3,
  otherStorey: 0.3,
  depthRange: 2000,
  compassRadius: 24,
  compassGap: 20,
  grain: 0.06,
} as const;

/** A dungeon's mesh as its view holds it: 36-byte vertices (position, normal, picture place, layer) and indices. */
export interface MapMesh {
  readonly vertices: GPUBuffer;
  readonly indices: GPUBuffer;
  readonly count: number;
}

/** What one frame of the map is drawn by. */
export interface MapFrame {
  readonly view: MapView;
  /** Device pixels a CSS pixel. */
  readonly ratio: number;
  /** The target's size in device pixels. */
  readonly size: { readonly width: number; readonly height: number };
  readonly every: boolean;
  readonly storey: number;
  readonly storeys: { readonly count: number; readonly storeyM: number; readonly top: number };
  readonly grid: { readonly cell: number; readonly columns: number; readonly rows: number };
}

/** The map's uniform for `frame`, as `mapShaders.ts` reads it. */
export function mapFloats(frame: MapFrame): Float32Array {
  const { view, ratio, size, storeys, grid } = frame;
  const [cosYaw, sinYaw, cosPitch, sinPitch] = [
    Math.cos(view.yaw),
    Math.sin(view.yaw),
    Math.cos(view.pitch),
    Math.sin(view.pitch),
  ];
  // From the paper's upper left, whichever way it is turned: against the paper's right and down, and toward the eye.
  const light = [
    -0.6 * cosYaw - 0.6 * sinYaw * sinPitch + 0.5 * sinYaw * cosPitch,
    0.6 * sinYaw - 0.6 * cosYaw * sinPitch + 0.5 * cosYaw * cosPitch,
    0.6 * cosPitch + 0.5 * sinPitch,
  ];
  const lightLength = Math.hypot(light[0] ?? 0, light[1] ?? 0, light[2] ?? 0);
  const scale = view.scale * ratio;
  const tremble = Math.max(0.6, Math.min(2.2, view.scale * 0.12)) * ratio;
  const line = Math.max(1, Math.round(Math.min(2.5, 0.6 + view.scale * 0.1) * ratio));
  const compass = (INK.compassRadius + INK.compassGap) * ratio;
  return new Float32Array([
    ...[cosYaw, sinYaw, cosPitch, sinPitch],
    ...[view.centre[0], view.centre[1], view.centre[2], scale],
    ...[size.width, size.height, frame.every ? 1 : 0, storeys.count],
    ...[INK.cutOver, INK.fadeFrom, INK.fadeOver, INK.fadeLeast],
    ...[frame.storey, storeys.storeyM, INK.otherStorey, storeys.top],
    ...[grid.cell, grid.columns, grid.rows, INK.depthRange],
    ...light.map((part) => part / lightLength),
    0,
    ...[tremble, line, INK.grain, 0],
    ...[size.width - compass, compass, INK.compassRadius * ratio, sinPitch],
    ...[sinYaw, -cosYaw * sinPitch, 1.5 * ratio, 0],
  ]);
}

export class MapInk {
  private readonly device: GPUDevice;
  private readonly faces: GPURenderPipeline;
  private readonly ink: GPURenderPipeline;
  private readonly facesLayout: GPUBindGroupLayout;
  private readonly inkLayout: GPUBindGroupLayout;
  private readonly uniform: GPUBuffer;
  private cells: GPUBuffer | null = null;
  private cellsVersion = -1;
  private targets: { facing: GPUTexture; kind: GPUTexture; depth: GPUTexture; ink: GPUBindGroup } | null = null;
  private facesGroup: GPUBindGroup | null = null;

  constructor(gpu: Gpu) {
    const { device } = gpu;
    this.device = device;
    const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    this.facesLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: both, buffer: { type: 'uniform' } },
        { binding: 1, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.inkLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: both, buffer: { type: 'uniform' } },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const facesModule = device.createShaderModule({ code: MAP_FACES_SHADER });
    this.faces = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.facesLayout] }),
      vertex: {
        module: facesModule,
        entryPoint: 'faces_vertex',
        buffers: [
          {
            arrayStride: 36,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module: facesModule,
        entryPoint: 'faces_fragment',
        targets: [{ format: 'rgba8unorm' }, { format: 'rgba32float' }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
    });
    const inkModule = device.createShaderModule({ code: MAP_INK_SHADER });
    this.ink = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.inkLayout] }),
      vertex: { module: inkModule, entryPoint: 'ink_vertex' },
      fragment: { module: inkModule, entryPoint: 'ink_fragment', targets: [{ format: gpu.format }] },
    });
    this.uniform = device.createBuffer({
      size: MAP_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
  }

  /** Each cell's word for the dungeon drawn now (storey-major: 1 walked or seen, 2 a flight's, 4 a landmark's), laid
   *  at `version`: the same version already held is not written again. */
  setCells(words: Uint32Array, version: number): void {
    if (this.cells && version === this.cellsVersion) return;
    this.cellsVersion = version;
    if (!this.cells || this.cells.size < Math.max(16, words.byteLength)) {
      this.cells?.destroy();
      this.cells = this.device.createBuffer({
        size: Math.max(16, words.byteLength),
        usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination,
      });
      this.facesGroup = this.device.createBindGroup({
        layout: this.facesLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniform } },
          { binding: 1, resource: { buffer: this.cells } },
        ],
      });
    }
    this.device.queue.writeBuffer(this.cells, 0, words.buffer as ArrayBuffer, words.byteOffset, words.byteLength);
  }

  /** Draws the map of `mesh` by `frame` into `into`, covering it. */
  draw(encoder: GPUCommandEncoder, into: GPUTextureView, frame: MapFrame, mesh: MapMesh | null): void {
    const floats = mapFloats(frame);
    this.device.queue.writeBuffer(this.uniform, 0, floats.buffer as ArrayBuffer);
    const targets = this.targetsOf(frame.size.width, frame.size.height);
    const faces = encoder.beginRenderPass({
      colorAttachments: [
        { view: viewOf(targets.facing), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
        { view: viewOf(targets.kind), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
      ],
      depthStencilAttachment: {
        view: viewOf(targets.depth),
        depthClearValue: 0,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    if (mesh && this.facesGroup && mesh.count > 0) {
      faces.setPipeline(this.faces);
      faces.setBindGroup(0, this.facesGroup);
      faces.setVertexBuffer(0, mesh.vertices);
      faces.setIndexBuffer(mesh.indices, 'uint32');
      faces.drawIndexed(mesh.count);
    }
    faces.end();
    const ink = encoder.beginRenderPass({
      colorAttachments: [{ view: into, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    ink.setPipeline(this.ink);
    ink.setBindGroup(0, targets.ink);
    ink.draw(3);
    ink.end();
  }

  /** Lets go of the targets and the cells, made again when next drawn. */
  release(): void {
    for (const texture of [this.targets?.facing, this.targets?.kind, this.targets?.depth]) texture?.destroy();
    this.targets = null;
    this.cells?.destroy();
    [this.cells, this.facesGroup] = [null, null];
  }

  private targetsOf(width: number, height: number) {
    const kept = this.targets;
    if (kept?.facing.width === width && kept.facing.height === height) return kept;
    for (const texture of [kept?.facing, kept?.kind, kept?.depth]) texture?.destroy();
    const size = [width, height];
    const drawnAndRead = TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding;
    const facing = this.device.createTexture({ size, format: 'rgba8unorm', usage: drawnAndRead });
    const kind = this.device.createTexture({ size, format: 'rgba32float', usage: drawnAndRead });
    const depth = this.device.createTexture({ size, format: 'depth32float', usage: TEXTURE_USAGE.renderAttachment });
    const ink = this.device.createBindGroup({
      layout: this.inkLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: viewOf(facing) },
        { binding: 2, resource: viewOf(kind) },
      ],
    });
    this.targets = { facing, kind, depth, ink };
    return this.targets;
  }
}
