import { SKY_NOW } from '../sky/skyDriver.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import { NEAR, ShadowMap, shadowLayouts } from '../shadow.ts';
import { SLOW_CLOCK_S } from '../water/shore.ts';
import { SAMPLES } from '../water/waterView.ts';
import { runsInView, tilesCasting, tilesInView } from './cull.ts';
import { NatureField, type NatureGround, type Packed } from './field.ts';
import { FLORA, type LoadedFlora, loadFlora, MESH_VERTEX_BYTES } from './flora.ts';
import { FORM_BLOCK_BYTES, FORM_FLOATS, type FormBuffers, formBuffers, type Part } from './forms.ts';
import { Kept } from './kept.ts';
import { type Cast, TREE } from './kinds.ts';
import { FRAME_FLOATS, NATURE_CAST_SHADER, NATURE_SHADER, SHADE_SEGMENTS } from './natureShader.ts';

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
  /** The way the wind blows (east, south), a unit vector, as a steady breeze; the weather's wind without one. */
  readonly wind?: readonly [number, number];
}

/** The plants' wind: the way it blows (east, south, a unit vector), how hard it bends them (1 a fresh breeze) and how
 *  gusty it is (0 to 1). */
export interface PlantWind {
  readonly way: readonly [number, number];
  readonly bend: number;
  readonly gust: number;
}

/** The breeze from the west-south-west the plants sway in before the weather is read, or in a calm's last way. */
const DEFAULT_WIND = [0.8, -0.6] as const;
const BREEZE: PlantWind = { way: DEFAULT_WIND, bend: 1, gust: 0.3 };
/** A fresh breeze, m/s: the wind that bends the plants as they were drawn. A storm's bends them about twice as far. */
const BREEZE_MS = 6;

/** The plants' wind from the weather's (m/s east and south) and its gusts; the breeze while no weather is read. */
export function plantWind(
  weather: { readonly wind: readonly [number, number]; readonly gust: number } | null,
): PlantWind {
  if (!weather) return BREEZE;
  const speed = Math.hypot(...weather.wind);
  const way: readonly [number, number] =
    speed > 0.1 ? [weather.wind[0] / speed, weather.wind[1] / speed] : DEFAULT_WIND;
  return { way, bend: Math.min(2.2, Math.max(0.1, Math.sqrt(speed / BREEZE_MS))), gust: weather.gust };
}
/** How much higher than the plants' reach the eye may stand over the ground below before nothing is drawn, metres. */
const HIGH_MARGIN_M = 2000;
const GUST_PER_M = 0.035;
/** WebGPU's storage usage flag, by the specification's value (gpu.ts names the flags the rest of the client uses). */
const STORAGE_USAGE = 0x80;

/** One draw: a part, its block's offset and a run of the list. */
interface Draw {
  readonly part: Part;
  readonly first: number;
  readonly count: number;
}

/** A buffer that grows by halves, so the eye's steps rarely make a new one. */
interface Grown {
  buffer: GPUBuffer | null;
}

/** A biome's flora on the GPU: its meshes, their terms and its pictures. */
interface Meshes {
  readonly cast: Cast;
  readonly forms: FormBuffers;
  readonly vertices: GPUBuffer;
  readonly blocks: GPUBuffer;
  readonly albedo: GPUTexture;
  readonly normal: GPUTexture;
}

/** Biomes' flora kept on the GPU once made, by device, shared by every view drawing the biome. A biome's is about
 *  60 MB (five or six 1024-pixel layers with their mips, albedo and normal), so of the biomes no view draws only the
 *  last left is kept: a landmass sailed back to reads, decodes and copies none of its flora again. */
const FLORA_KEPT = new WeakMap<GPUDevice, Kept<Cast, Meshes>>();
const FLORA_IDLE = 1;

function floraKept(device: GPUDevice): Kept<Cast, Meshes> {
  let kept = FLORA_KEPT.get(device);
  if (!kept) {
    kept = new Kept(FLORA_IDLE, (meshes) => {
      for (const owned of [meshes.vertices, meshes.blocks, meshes.albedo, meshes.normal]) owned.destroy();
    });
    FLORA_KEPT.set(device, kept);
  }
  return kept;
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
  private readonly pipelines: {
    /** The near meshes, both sides of every face: cards are seen from either. */
    readonly plants: GPURenderPipeline;
    /** The far quads. */
    readonly sprites: GPURenderPipeline;
    readonly shade: GPURenderPipeline;
    /** The near plants' depth along the sun, into the shadow map. */
    readonly cast: GPURenderPipeline;
  };
  private readonly frameBuffer: GPUBuffer;
  private meshes: Meshes | null = null;
  /** The biome whose flora is loading or loaded, and what came of it: null while it loads or if it failed. */
  private loading: { cast: Cast; loaded: LoadedFlora | null; failed: boolean } | null = null;
  private readonly sampler: GPUSampler;
  private readonly cutSampler: GPUSampler;
  private readonly slots: Grown = { buffer: null };
  private readonly list: Grown = { buffer: null };
  private readonly corners: Grown = { buffer: null };
  private bind: GPUBindGroup | null = null;
  private listed: Packed | null = null;
  private visible = new Uint8Array();
  private draws: Draw[] = [];
  private casting = new Uint8Array();
  private casts: Draw[] = [];

  /** `budgetMs` is how long one update may spend scattering newly near tiles. */
  constructor(gpu: Gpu, budgetMs = 6) {
    this.gpu = gpu;
    this.field = new NatureField(budgetMs);
    const { device } = gpu;
    const seen = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    const stored = { type: 'read-only-storage' } as const;
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: seen, buffer: { type: 'uniform' } },
        {
          binding: 1,
          visibility: seen,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: FORM_FLOATS * 4 },
        },
        { binding: 2, visibility: SHADER_STAGE.vertex, buffer: stored },
        { binding: 3, visibility: SHADER_STAGE.vertex, buffer: stored },
        { binding: 4, visibility: SHADER_STAGE.vertex, buffer: stored },
        { binding: 5, visibility: SHADER_STAGE.fragment, texture: { viewDimension: '2d-array' } },
        { binding: 6, visibility: SHADER_STAGE.fragment, texture: { viewDimension: '2d-array' } },
        { binding: 7, visibility: SHADER_STAGE.fragment, sampler: {} },
        { binding: 8, visibility: SHADER_STAGE.fragment, sampler: {} },
      ],
    });
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    // The near meshes' cards read their leaves from one mip: most of a card's pixels are tested and cut away, and on
    // a CPU renderer that read is what a forest's frame costs. An alpha-cut edge hides the step.
    this.cutSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'nearest' });
    const module = device.createShaderModule({ code: NATURE_SHADER });
    const shadows = shadowLayouts(device);
    const sky = skyUniformFor(device);
    const layout = device.createPipelineLayout({
      bindGroupLayouts: [this.layout, shadows.receiver, sky.empty, sky.layout],
    });
    const mesh: GPUVertexBufferLayout = {
      arrayStride: MESH_VERTEX_BYTES,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
        { shaderLocation: 2, offset: 16, format: 'snorm8x4' },
        { shaderLocation: 3, offset: 20, format: 'float32x2' },
        { shaderLocation: 4, offset: 28, format: 'unorm8x4' },
        { shaderLocation: 5, offset: 32, format: 'unorm8x4' },
      ],
    };
    const drawn = (vertex: string, fragment: string, buffers: GPUVertexBufferLayout[]) =>
      device.createRenderPipeline({
        layout,
        vertex: { module, entryPoint: vertex, buffers },
        fragment: { module, entryPoint: fragment, targets: [{ format: gpu.format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
        multisample: { count: SAMPLES },
      });
    // The shade only darkens what is under it: the colour drawn is kept by the share its alpha leaves.
    const castModule = device.createShaderModule({ code: NATURE_CAST_SHADER });
    const darken: GPUBlendState = {
      color: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    this.pipelines = {
      plants: drawn('plant_vertex', 'plant_fragment', [mesh]),
      sprites: drawn('sprite_vertex', 'sprite_fragment', []),
      shade: device.createRenderPipeline({
        layout,
        vertex: { module, entryPoint: 'shade_vertex' },
        fragment: { module, entryPoint: 'shade_fragment', targets: [{ format: gpu.format, blend: darken }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
        multisample: { count: SAMPLES },
      }),
      cast: device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout, shadows.caster] }),
        vertex: { module: castModule, entryPoint: 'plant_cast', buffers: [mesh] },
        fragment: { module: castModule, entryPoint: 'plant_cast_fragment', targets: [] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
      }),
    };
    this.frameBuffer = device.createBuffer({
      size: FRAME_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
  }

  /** Keeps the plants round the eye and works out what this frame draws, and with a shadow map that is on, what its
   *  near plants cast. Answers whether tiles are still waiting to be scattered, so a page that draws only when asked
   *  draws again. */
  update(frame: NatureFrame, ground: NatureGround, shadow?: ShadowMap): boolean {
    // From high above, every plant is past its reach: nothing is drawn and nothing scattered. The margin keeps the
    // plants on a ridge in view from high over the valley beside it.
    const below = ground.sample(frame.eye[0], frame.eye[1]).height * frame.exaggeration;
    if (frame.eye[2] - below > TREE.reachM + HIGH_MARGIN_M) {
      [this.draws, this.casts] = [[], []];
      return false;
    }
    const waiting = this.field.update(frame.eye[0], frame.eye[1], ground);
    // Until the biome's flora has loaded, its plants are not drawn; the page is asked to draw again meanwhile.
    if (!this.keepMeshes(this.field.drawnCast, ground.biome)) {
      [this.draws, this.casts] = [[], []];
      return !this.loading?.failed;
    }
    this.sendStore();
    const packed = this.field.packed;
    if (this.listed !== packed) this.sendList(packed);
    if (!this.bind) this.rebind();
    const [eastFromAnchor, southFromAnchor] = [packed.anchor[0] - frame.eye[0], packed.anchor[1] - frame.eye[1]];
    const { reading } = SKY_NOW.current;
    const blowing = frame.wind ? { ...BREEZE, way: frame.wind } : plantWind(reading);
    const wind = blowing.way;
    const gusts = ((packed.anchor[0] * wind[0] + packed.anchor[1] * wind[1]) * GUST_PER_M) % (Math.PI * 2);
    const floats = new Float32Array(FRAME_FLOATS);
    floats.set(frame.fromEye);
    floats.set([eastFromAnchor, southFromAnchor, -frame.eye[2], frame.exaggeration], 16);
    floats.set([frame.time % SLOW_CLOCK_S, wind[0], wind[1], gusts], 20);
    floats.set([ground.snowM, blowing.bend, blowing.gust, 0], 24);
    floats.set([...(ground.groundColour ?? [0, 0, 0]), ground.groundColour ? 1 : 0], 28);
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
    this.casts = [];
    if (shadow?.active) {
      if (this.casting.length !== packed.tiles.length / 4) this.casting = new Uint8Array(packed.tiles.length / 4);
      tilesCasting(
        packed,
        anchorFromEye,
        frame.exaggeration,
        (low, high) => shadow.reaches(low, high, NEAR),
        this.casting,
      );
      for (const group of packed.groups) {
        const part = group.far ? undefined : parts[group.form]?.[0];
        if (!part) continue;
        const runs = runsInView(group, this.casting);
        for (let run = 0; run < runs.length; run += 2) {
          this.casts.push({ part, first: runs[run] ?? 0, count: runs[run + 1] ?? 0 });
        }
      }
    }
    return waiting;
  }

  /** Draws the near plants `update` found casting into the sun's near shadow map; past it their contact shades stand
   *  in, so they cast nothing into the far one. */
  castInto(pass: GPURenderPassEncoder, shadow: ShadowMap): void {
    const { meshes, bind } = this;
    if (!meshes || !bind || this.casts.length === 0 || shadow.cascade !== NEAR) return;
    pass.setPipeline(this.pipelines.cast);
    pass.setBindGroup(1, shadow.casterGroup(this.pipelines.cast));
    pass.setVertexBuffer(0, meshes.vertices);
    for (const { part, first, count } of this.casts) {
      pass.setBindGroup(0, bind, [part.block * FORM_BLOCK_BYTES]);
      pass.draw(part.vertexCount, count, part.firstVertex, first);
    }
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

  /** Draws into the land's pass (four samples, depth reversed) what `update` worked out: the contact shades on the
   *  land first, then the near meshes and the far quads over them, in the sun's shadows when a map is given. */
  drawInto(pass: GPURenderPassEncoder, shadow?: ShadowMap): void {
    const { meshes, bind } = this;
    if (!meshes || !bind || this.draws.length === 0) return;
    pass.setPipeline(this.pipelines.shade);
    // Every pipeline here shares the shadow's layout, so one group serves them all.
    pass.setBindGroup(1, (shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.pipelines.shade));
    skyUniformFor(this.gpu.device).bindShared(pass, [2]);
    for (const { part, first, count } of this.draws) {
      if (!part.shaded) continue;
      pass.setBindGroup(0, bind, [part.block * FORM_BLOCK_BYTES]);
      pass.draw(SHADE_SEGMENTS * 3, count, 0, first);
    }
    pass.setVertexBuffer(0, meshes.vertices);
    let shown: GPURenderPipeline | null = null;
    for (const { part, first, count } of this.draws) {
      const pipeline = part.far ? this.pipelines.sprites : this.pipelines.plants;
      if (pipeline !== shown) pass.setPipeline((shown = pipeline));
      pass.setBindGroup(0, bind, [part.block * FORM_BLOCK_BYTES]);
      pass.draw(part.vertexCount, count, part.firstVertex, first);
    }
  }

  /** Gives the GPU back this view's buffers and lets go of its biome's flora (`floraKept`); it draws nothing after. */
  destroy(): void {
    this.frameBuffer.destroy();
    this.dropMeshes();
    for (const grown of [this.slots, this.list, this.corners]) grown.buffer?.destroy();
    [this.bind, this.draws, this.loading] = [null, [], null];
  }

  /** The biome's baked meshes, terms and pictures on the GPU, taken from those kept or loaded when the biome changes.
   *  Answers whether they are ready to draw. */
  private keepMeshes(cast: Cast, biome: string): boolean {
    if (this.meshes?.cast === cast) return true;
    const kept = floraKept(this.gpu.device);
    const taken = kept.take(cast);
    if (taken) {
      this.dropMeshes();
      [this.meshes, this.loading, this.bind] = [taken, null, null];
      return true;
    }
    if (this.loading?.cast !== cast) {
      const loading: { cast: Cast; loaded: LoadedFlora | null; failed: boolean } = {
        cast,
        loaded: null,
        failed: false,
      };
      this.loading = loading;
      loadFlora(cast, biome).then(
        (loaded) => ([loading.loaded, loading.failed] = [loaded, !loaded]),
        (error: unknown) => {
          loading.failed = true;
          console.warn(`the ${biome} flora did not load`, error);
        },
      );
    }
    const loaded = this.loading.loaded;
    if (!loaded) return false;
    this.dropMeshes();
    const { device } = this.gpu;
    const forms = formBuffers(cast, loaded);
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
    const albedo = this.pictureArray(loaded.layers.map((layer) => layer.albedo));
    const normal = this.pictureArray(loaded.layers.map((layer) => layer.normal));
    this.meshes = { cast, forms, vertices, blocks, albedo, normal };
    kept.keep(cast, this.meshes);
    // Its pictures are on the GPU now: the decoded copies are let go.
    this.loading.loaded = null;
    this.bind = null;
    return true;
  }

  /** A texture array of a biome's layers, each picture's mip levels copied from where they lie beside it. */
  private pictureArray(pictures: readonly ImageBitmap[]): GPUTexture {
    const side = FLORA.layer;
    const texture = this.gpu.device.createTexture({
      size: { width: side, height: side, depthOrArrayLayers: pictures.length },
      format: 'rgba8unorm',
      mipLevelCount: FLORA.mips,
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination | TEXTURE_USAGE.renderAttachment,
    });
    for (const [layer, picture] of pictures.entries()) {
      for (let level = 0; level < FLORA.mips; level++) {
        const size = side >> level;
        const origin = level === 0 ? { x: 0, y: 0 } : { x: side, y: side - ((2 * side) >> level) };
        this.gpu.device.queue.copyExternalImageToTexture(
          { source: picture, origin },
          { texture, mipLevel: level, origin: { x: 0, y: 0, z: layer } },
          { width: size, height: size },
        );
      }
      picture.close();
    }
    return texture;
  }

  /** Lets go of this view's hold on its biome's flora, kept for another view or dropped (`floraKept`). */
  private dropMeshes(): void {
    if (this.meshes) floraKept(this.gpu.device).give(this.meshes.cast);
    this.meshes = null;
  }

  /** Sends the store's changed pages to the GPU; all of it when it has grown. */
  private sendStore(): void {
    const { store } = this.field;
    const { queue } = this.gpu.device;
    if (store.replaced || !this.slots.buffer) {
      this.ensure(this.slots, store.data.byteLength, true);
      queue.writeBuffer(this.slots.buffer as GPUBuffer, 0, store.data);
      store.replaced = false;
      store.takeChanges();
      return;
    }
    const runs = store.takeChanges();
    for (let run = 0; run < runs.length; run += 2) {
      const [first, floats] = [runs[run] ?? 0, runs[run + 1] ?? 0];
      queue.writeBuffer(this.slots.buffer, first * 4, store.data, first, floats);
    }
  }

  /** Sends a new list of slots, and the tiles' corners it places them from. */
  private sendList(packed: Packed): void {
    const { queue } = this.gpu.device;
    this.ensure(this.list, packed.list.byteLength, false);
    if (packed.list.length > 0) queue.writeBuffer(this.list.buffer as GPUBuffer, 0, packed.list);
    this.ensure(this.corners, packed.corners.byteLength, false);
    if (packed.corners.length > 0) queue.writeBuffer(this.corners.buffer as GPUBuffer, 0, packed.corners);
    this.listed = packed;
  }

  /** Makes a storage buffer at least `bytes` long, `exactly` that or half again; a new one is bound anew. */
  private ensure(grown: Grown, bytes: number, exactly: boolean): void {
    const needed = Math.max(16, Math.ceil(bytes / 16) * 16);
    if (grown.buffer && grown.buffer.size >= needed && !exactly) return;
    if (grown.buffer && grown.buffer.size === needed) return;
    grown.buffer?.destroy();
    grown.buffer = this.gpu.device.createBuffer({
      size: exactly ? needed : Math.ceil((needed * 1.5) / 16) * 16,
      usage: STORAGE_USAGE | BUFFER_USAGE.copyDestination,
    });
    this.bind = null;
    this.rebind();
  }

  private rebind(): void {
    const [slots, list, corners] = [this.slots.buffer, this.list.buffer, this.corners.buffer];
    if (!this.meshes || !slots || !list || !corners) return;
    const arrayView = (texture: GPUTexture) => texture.createView({ dimension: '2d-array' });
    this.bind = this.gpu.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: { buffer: this.meshes.blocks, size: FORM_FLOATS * 4 } },
        { binding: 2, resource: { buffer: slots } },
        { binding: 3, resource: { buffer: list } },
        { binding: 4, resource: { buffer: corners } },
        { binding: 5, resource: arrayView(this.meshes.albedo) },
        { binding: 6, resource: arrayView(this.meshes.normal) },
        { binding: 7, resource: this.sampler },
        { binding: 8, resource: this.cutSampler },
      ],
    });
  }
}
