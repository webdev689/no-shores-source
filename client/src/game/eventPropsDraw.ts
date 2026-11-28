// The public events' props on the GPU: each module's surfaces in one buffer, every prop a draw of its module with its
// place, turn, scale, rise, lid and glow read from a table by its instance. Lit as the city is (the sky, the sun's
// shadows, the lamps), each material its own colour worked by code over the module's own frame, the Lattice's crystal
// as crystal.ts draws it, and its brightest crystal given into the light layer. A module that opens (the fissure) has
// its chasm under the ground seen through its mouth: each such point takes the depth of where the eye's line crosses
// the land at its foot, a little toward the eye, so the land round the mouth gives way and anything nearer keeps it.
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import type { Drawer } from './scene.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { LIGHT_DEPTH, LIGHT_TARGET } from '../combat/lightLayer.ts';
import { ShadowMap, farPlace, shadowLayouts } from '../shadow.ts';
import { EVENT_LAMPS, type LampPlace } from '../sky/lamps.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SAMPLES } from '../water/waterView.ts';
import { type EventProp, OPENS, type PropModule, propLamps } from '../city/eventProps.ts';
import { loadModuleOf, loadModules, moduleNumber, moduleShape } from '../city/modules.ts';
import { BannerCloth, type Hung } from './guild/bannerCloth.ts';
import { STRIDE, packLips, packModule } from './eventPropsPack.ts';
import { LOOK, PROPS_CAST_SHADER, PROPS_SHADER } from './eventPropsShader.ts';

/** The most lip stations the drawer holds, over every module that opens. */
const LIPS_MOST = 256;

/** A prop's row in the table: where it stands from the eye and its turn; its scale, rise, lid and glow; whether it
 *  opens, its module's height, and where its lips start in the lips' list and how many stations they have; its look
 *  (LOOK: its canvas grey, or a way opened drawn dark), and its tint (none, a ghost's) or a way opened's doorway. */
const PROP_FLOATS = 16;
/** No lamps and nothing drawn, shared, so a place with no props makes nothing a frame. */
const NO_LAMPS: readonly LampPlace[] = [];
const NONE_DRAWN: readonly [EventProp, Made, number][] = [];
/** The props whose canvas is the Tithe's grey, as its sails' is (its banner, its airship's); every other
 *  canvas is oiled tan. */
const GREY_CANVAS: ReadonlySet<EventProp['module']> = new Set<PropModule>(['tithe-banner', 'tithe-airship']);

const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: STRIDE,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
    { shaderLocation: 2, offset: 16, format: 'uint8x4' },
  ],
};

/** A module's surfaces made ready to draw: its vertices and triangles (its crystal's last, from `crystalFrom`), its
 *  height and half its width across, and where its lips stand in the lips' list, if it opens the land. */
type Made = {
  readonly vertices: GPUBuffer;
  readonly indices: GPUBuffer;
  readonly count: number;
  readonly crystalFrom: number;
  readonly height: number;
  readonly reach: number;
  readonly lips: { readonly first: number; readonly count: number } | null;
};

/** Where a prop lies as the sun's far shadow map can show it, for what the map is kept by (`farPlace`): its place, its
 *  reach and its height risen in far texels, its turns at that reach; its module's half width across `reach` and its
 *  height. An airship bobbing as it hangs, or a crown breathing, moves less than that and leaves the map kept. */
export function propFarPlace(prop: EventProp, reach: number, height: number): number[] {
  const across = reach * prop.scale;
  return farPlace([...prop.at, across, height * prop.scale * prop.rise], [prop.turn, prop.lid, prop.roll ?? 0], across);
}

/** The public events' props, drawn as one of the scene's drawers from the list `set` hands it each frame. */
export class EventPropsDraw implements Drawer {
  private readonly gpu: Gpu;
  /** The pipelines, made the first frame there are props to draw: most of the game's places have none. */
  private pipes: Record<'draw' | 'chasm' | 'cast' | 'light', GPURenderPipeline> | null = null;
  private readonly viewLayout: GPUBindGroupLayout;
  private readonly view: GPUBuffer;
  /** The scene's seconds as the view takes them, after its matrix. */
  private readonly seconds = new Float32Array(4);
  private readonly viewGroup: GPUBindGroup;
  private readonly propsLayout: GPUBindGroupLayout;
  /** Every opening module's lips, and how many stations are taken. */
  private readonly lips: GPUBuffer;
  private lipsTaken = 0;
  private table: GPUBuffer | null = null;
  private tableGroup: GPUBindGroup | null = null;
  private readonly made = new Map<string, Made>();
  private props: readonly EventProp[] = [];
  /** The table's rows as written, kept between frames so a frame allocates none. */
  private rows = new Float32Array(16 * PROP_FLOATS);
  /** The props drawn this frame, and those split by whether they open, kept between frames likewise. */
  private readonly drawn: [EventProp, Made, number][] = [];
  private readonly opening: [EventProp, Made, number][] = [];
  private readonly plain: [EventProp, Made, number][] = [];
  private ready = false;
  private readonly cloth: BannerCloth;
  /** The frame the table was last written for, and the props it holds, each with its row. */
  private written: { fromEye: Float32Array | null; props: readonly EventProp[] } = { fromEye: null, props: [] };

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.cloth = new BannerCloth(gpu);
    const { device } = gpu;
    const viewLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} }],
    });
    this.propsLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment,
          buffer: { type: 'read-only-storage' },
        },
        { binding: 1, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.lips = device.createBuffer({
      size: LIPS_MOST * 16,
      usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination,
    });
    this.viewLayout = viewLayout;
    this.view = device.createBuffer({ size: 80, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.viewGroup = device.createBindGroup({
      layout: viewLayout,
      entries: [{ binding: 0, resource: { buffer: this.view } }],
    });
    void loadModules().then(() => {
      this.ready = true;
    });
  }

  /** The pipelines, made once on the first frame that draws a prop. */
  private pipelines(): NonNullable<EventPropsDraw['pipes']> {
    if (this.pipes) return this.pipes;
    const { device } = this.gpu;
    const { viewLayout } = this;
    const module = device.createShaderModule({ code: PROPS_SHADER });
    const castModule = device.createShaderModule({ code: PROPS_CAST_SHADER });
    const shadows = shadowLayouts(device);
    const sky = skyUniformFor(device);
    const layout = device.createPipelineLayout({
      bindGroupLayouts: [viewLayout, shadows.receiver, this.propsLayout, sky.layout],
    });
    const depth = (write: boolean, compare: GPUCompareFunction): GPUDepthStencilState => ({
      format: REVERSED_DEPTH.format,
      depthWriteEnabled: write,
      depthCompare: compare,
    });
    const vertex = { module, entryPoint: 'prop_vertex', buffers: [VERTEX_LAYOUT] };
    const draw = device.createRenderPipeline({
      layout,
      vertex,
      fragment: { module, entryPoint: 'prop_fragment', targets: [{ format: this.gpu.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true, REVERSED_DEPTH.compare),
      multisample: { count: SAMPLES },
    });
    const chasm = device.createRenderPipeline({
      layout,
      vertex,
      fragment: { module, entryPoint: 'chasm_fragment', targets: [{ format: this.gpu.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true, REVERSED_DEPTH.compare),
      multisample: { count: SAMPLES },
    });
    const light = device.createRenderPipeline({
      layout,
      vertex,
      fragment: { module, entryPoint: 'light_fragment', targets: [LIGHT_TARGET] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: LIGHT_DEPTH,
    });
    const cast = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout, shadows.caster, this.propsLayout] }),
      vertex: { module: castModule, entryPoint: 'cast_vertex', buffers: [VERTEX_LAYOUT] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.pipes = { draw, chasm, cast, light };
    return this.pipes;
  }

  /** A guild's banner cloth the next frames hang with the props (an outpost's standard's), or none. */
  hang(hung: Hung | null): void {
    this.cloth.set(hung);
  }

  /** The props the next frames draw (eventProps.ts), and the lamps their crystal lights. */
  set(props: readonly EventProp[]): void {
    this.props = props;
    EVENT_LAMPS.current = props.length > 0 ? propLamps(props) : NO_LAMPS;
  }

  /** Lets go of the modules `gone` names, made ready to draw before: a Breach's run's, once the player is out of it. */
  forget(gone: (name: EventProp['module']) => boolean): void {
    for (const [name, made] of this.made) {
      if (!gone(name)) continue;
      made.vertices.destroy();
      made.indices.destroy();
      this.made.delete(name);
    }
  }

  /** A module made ready to draw, the first time it is drawn after its meshes have come; none before, its meshes
   *  asked for again while one is missing. */
  private madeOf(name: EventProp['module']): Made | null {
    const known = this.made.get(name);
    if (known) return known;
    if (!this.ready) return null;
    const number = moduleNumber(name);
    const packed = number >= 0 ? packModule(number) : null;
    if (!packed) {
      // A group of its that failed to come is asked for again, a while after it failed.
      if (number >= 0) void loadModuleOf(name);
      return null;
    }
    const { device } = this.gpu;
    const buffer = (data: ArrayBuffer | Uint32Array, usage: number) => {
      const made = device.createBuffer({
        size: Math.max(16, data.byteLength),
        usage: usage | BUFFER_USAGE.copyDestination,
      });
      device.queue.writeBuffer(made, 0, data);
      return made;
    };
    const lipped = OPENS.has(name) ? packLips(number) : null;
    let lips: Made['lips'] = null;
    if (lipped && this.lipsTaken + lipped.length / 4 <= LIPS_MOST) {
      lips = { first: this.lipsTaken, count: lipped.length / 4 };
      device.queue.writeBuffer(this.lips, this.lipsTaken * 16, lipped);
      this.lipsTaken += lips.count;
    }
    const made: Made = {
      vertices: buffer(packed.vertices, BUFFER_USAGE.vertex),
      indices: buffer(packed.indices, BUFFER_USAGE.index),
      count: packed.indices.length,
      crystalFrom: packed.crystalFrom,
      height: moduleShape(number).size[2] ?? 1,
      reach: Math.hypot(moduleShape(number).size[0] ?? 1, moduleShape(number).size[1] ?? 1) / 2,
      lips,
    };
    this.made.set(name, made);
    return made;
  }

  /** Writes the view and the props' table for a frame seen from `eye`, and answers the props ready to draw, each with
   *  its row in the table. */
  private prepared(fromEye: Float32Array, eye: readonly [number, number, number]): [EventProp, Made, number][] {
    const { written, drawn } = this;
    if (written.fromEye === fromEye && written.props === this.props) return drawn;
    [written.fromEye, written.props, drawn.length] = [fromEye, this.props, 0];
    for (const prop of this.props) {
      const made = this.madeOf(prop.module);
      if (made) drawn.push([prop, made, drawn.length]);
    }
    if (drawn.length === 0) return drawn;
    this.gpu.device.queue.writeBuffer(this.view, 0, fromEye, 0, 16);
    if (this.rows.length < drawn.length * PROP_FLOATS) this.rows = new Float32Array(drawn.length * 2 * PROP_FLOATS);
    const rows = this.rows.subarray(0, drawn.length * PROP_FLOATS);
    rows.fill(0);
    drawn.forEach(([prop, made], row) => {
      const first = row * PROP_FLOATS;
      rows[first] = prop.at[0] - eye[0];
      rows[first + 1] = prop.at[1] - eye[1];
      rows[first + 2] = prop.at[2] - eye[2];
      rows[first + 3] = prop.turn;
      rows[first + 4] = prop.scale;
      rows[first + 5] = prop.rise;
      rows[first + 6] = prop.lid;
      rows[first + 7] = prop.glow;
      rows[first + 8] = made.lips ? 1 : 0;
      rows[first + 9] = made.height;
      rows[first + 10] = made.lips?.first ?? 0;
      // A module that opens has its lips' count here; any other its roll (an airship's lean), if any.
      rows[first + 11] = made.lips ? made.lips.count : (prop.roll ?? 0);
      rows[first + 12] = prop.dark ? LOOK.dark : GREY_CANVAS.has(prop.module) ? LOOK.grey : 0;
      [rows[first + 13] = 0, rows[first + 14] = 0, rows[first + 15] = 0] = prop.dark ?? prop.tint ?? [];
    });
    if (!this.table || this.table.size < rows.byteLength) {
      this.table?.destroy();
      const size = Math.max(4096, 2 ** Math.ceil(Math.log2(rows.byteLength)));
      this.table = this.gpu.device.createBuffer({ size, usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination });
      this.tableGroup = this.gpu.device.createBindGroup({
        layout: this.propsLayout,
        entries: [
          { binding: 0, resource: { buffer: this.table } },
          { binding: 1, resource: { buffer: this.lips } },
        ],
      });
    }
    this.gpu.device.queue.writeBuffer(this.table, 0, rows);
    return drawn;
  }

  /** Draws each of `drawn`, all its triangles or its crystal's alone. */
  private drawEach(pass: GPURenderPassEncoder, drawn: readonly [EventProp, Made, number][], crystal = false): void {
    for (const [, made, row] of drawn) {
      const from = crystal ? made.crystalFrom : 0;
      if (from >= made.count) continue;
      pass.setVertexBuffer(0, made.vertices);
      pass.setIndexBuffer(made.indices, 'uint32');
      pass.drawIndexed(made.count - from, 1, from, 0, row);
    }
  }

  castInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    shot: { eye: readonly [number, number, number] },
    _time: number,
    shadow: ShadowMap,
  ): void {
    const drawn = this.prepared(fromEye, shot.eye);
    if (drawn.length === 0 || !this.tableGroup) return;
    // Where each stands and how far it has risen or opened, which its draws do not show, for the far shadow map.
    for (const [prop, made] of drawn) shadow.tally(...propFarPlace(prop, made.reach, made.height));
    const { cast } = this.pipelines();
    pass.setPipeline(cast);
    pass.setBindGroup(0, this.viewGroup);
    pass.setBindGroup(1, shadow.casterGroup(cast));
    pass.setBindGroup(2, this.tableGroup);
    this.drawEach(pass, drawn);
  }

  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    shot: { eye: readonly [number, number, number] },
    time: number,
    shadow: ShadowMap,
  ): void {
    const drawn = this.prepared(fromEye, shot.eye);
    if (drawn.length === 0 || !this.tableGroup) return;
    this.seconds[0] = time;
    this.gpu.device.queue.writeBuffer(this.view, 64, this.seconds);
    this.cloth.drawInto(pass, fromEye, shot.eye, time);
    pass.setBindGroup(0, this.viewGroup);
    pass.setBindGroup(2, this.tableGroup);
    skyUniformFor(this.gpu.device).bindShared(pass);
    const [opening, plain] = [this.opening, this.plain];
    [opening.length, plain.length] = [0, 0];
    for (const each of drawn) (each[1].lips ? opening : plain).push(each);
    const { draw, chasm } = this.pipelines();
    for (const [pipeline, some] of [
      [draw, plain],
      [chasm, opening],
    ] as const) {
      if (some.length === 0) continue;
      pass.setPipeline(pipeline);
      pass.setBindGroup(1, shadow.receiverGroup(pipeline));
      this.drawEach(pass, some);
    }
  }

  lightInto(pass: GPURenderPassEncoder, fromEye: Float32Array): void {
    const drawn = this.written.fromEye === fromEye ? this.drawn : NONE_DRAWN;
    if (drawn.length === 0 || !this.tableGroup) return;
    const { light } = this.pipelines();
    pass.setPipeline(light);
    pass.setBindGroup(0, this.viewGroup);
    pass.setBindGroup(2, this.tableGroup);
    skyUniformFor(this.gpu.device).bindShared(pass);
    pass.setBindGroup(1, ShadowMap.none(this.gpu).receiverGroup(light));
    this.drawEach(pass, drawn, true);
  }
}
