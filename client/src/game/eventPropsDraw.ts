// The public events' props on the GPU: each module's surfaces in one buffer, every prop a draw of its module with its
// place, turn, scale, rise, lid and glow read from a table by its instance. Lit as the city is (the sky, the sun's
// shadows, the lamps), each material its own colour worked by code over the module's own frame, the Lattice's crystal
// as crystal.ts draws it, and its brightest crystal given into the light layer. A module that opens (the fissure) has
// its chasm under the ground seen through its mouth: each such point takes the depth of where the eye's line crosses
// the land at its foot, a little toward the eye, so the land round the mouth gives way and anything nearer keeps it.
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import type { Drawer } from './scene.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { LIGHT_DEPTH, LIGHT_TARGET, LIGHT_WGSL } from '../combat/lightLayer.ts';
import { SHADOW_CAST_WGSL, SHADOW_WGSL, ShadowMap, shadowLayouts } from '../shadow.ts';
import { EVENT_LAMPS, type LampPlace } from '../sky/lamps.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { CRYSTAL_HOT, CRYSTAL_WGSL } from '../city/crystal.ts';
import { type EventProp, OPENS, type PropModule, propLamps } from '../city/eventProps.ts';
import { loadModules, moduleNumber, moduleShape } from '../city/modules.ts';
import { MATERIALS, type Material, STRIDE, packLips, packModule } from './eventPropsPack.ts';

/** A material's number in the shader, as WGSL. */
const id = (material: Material): string => `${MATERIALS.indexOf(material)}u`;
/** How far toward the eye a point of a chasm is drawn, as a share of its distance: enough to stand clear of the land
 *  round the mouth, too little to come in front of a rise or a house nearer the eye. */
const CHASM_LEAD = 0.04;
/** The most lip stations the drawer holds, over every module that opens. */
const LIPS_MOST = 256;

/** A prop's row in the table: where it stands from the eye and its turn; its scale, rise, lid and glow; whether it
 *  opens, its module's height, and where its lips start in the lips' list and how many stations they have; whether
 *  its canvas is grey. */
const PROP_FLOATS = 16;
/** No lamps and nothing drawn, shared, so a place with no props makes nothing a frame. */
const NO_LAMPS: readonly LampPlace[] = [];
const NONE_DRAWN: readonly [EventProp, Made, number][] = [];
/** The props whose canvas is the Tithe's unmarked grey, as its sails are; every other canvas is oiled tan. */
const GREY_CANVAS: ReadonlySet<EventProp['module']> = new Set<PropModule>(['tithe-banner']);

const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: STRIDE,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
    { shaderLocation: 2, offset: 16, format: 'uint8x4' },
  ],
};

const PLACE_WGSL = /* wgsl */ `
struct View { from_eye: mat4x4f }
@group(0) @binding(0) var<uniform> view: View;
struct Prop { place: vec4f, shape: vec4f, about: vec4f, look: vec4f }
@group(2) @binding(0) var<storage, read> props: array<Prop>;

struct Vertex {
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) material: vec4u,
  @builtin(instance_index) prop: u32,
}

struct Placed { from_eye: vec3f, normal: vec3f, below: f32 }

// A vertex of the module where its prop stands, measured from the eye: opened (widened from a line and deepened) or
// risen out of the ground, swung up about its own x at its origin (a lid's hinge), scaled, and turned clockwise from
// north. 'below' is how far under its foot it stands once risen: what is under the ground is not drawn.
fn placed(vertex: Vertex) -> Placed {
  let prop = props[vertex.prop];
  var local = vertex.position;
  var normal = vertex.normal.xyz;
  var below = 1.0;
  if prop.about.x > 0.5 {
    let across = mix(0.04, 1.0, prop.shape.y);
    let deep = mix(0.08, 1.0, prop.shape.y);
    local = vec3f(local.x, local.y * across, local.z * deep);
    normal = vec3f(normal.x * across * deep, normal.y * deep, normal.z * across);
  } else {
    local.z -= (1.0 - prop.shape.y) * prop.about.y;
    // Cut at the ground only while rising: standing, a lid's hasp hangs under its hinge and stays drawn.
    below = select(1.0, local.z, prop.shape.y < 1.0);
  }
  let lid = vec2f(cos(prop.shape.z), sin(prop.shape.z));
  local = vec3f(local.x, local.y * lid.x - local.z * lid.y, local.y * lid.y + local.z * lid.x);
  normal = vec3f(normal.x, normal.y * lid.x - normal.z * lid.y, normal.y * lid.y + normal.z * lid.x);
  local *= prop.shape.x;
  let turn = vec2f(cos(prop.place.w), sin(prop.place.w));
  let world = vec3f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x, local.z);
  normal = vec3f(normal.x * turn.x - normal.y * turn.y, normal.x * turn.y + normal.y * turn.x, normal.z);
  return Placed(world + prop.place.xyz, normal, below);
}
`;

export const PROPS_SHADER = /* wgsl */ `
${SHARED_WGSL}
${SHADOW_WGSL}
${CRYSTAL_WGSL}
${LIGHT_WGSL}
${PLACE_WGSL}

const AMBIENT = 0.35;
const BOUNCE = 0.15;
const CRYSTAL = ${id('crystal')};
const CHASM_LEAD = ${CHASM_LEAD};
// Each opening module's lips, station by station along its x: (x, the low lip's y, the high lip's y, 0).
@group(2) @binding(1) var<storage, read> lips: array<vec4f>;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) from_eye: vec3f,
  @location(2) @interpolate(flat) material: u32,
  @location(3) glow: f32,
  @location(4) below: f32,
  @location(5) local: vec3f,
  @location(6) @interpolate(flat) prop: u32,
}

@vertex fn prop_vertex(vertex: Vertex) -> Out {
  let at = placed(vertex);
  var out: Out;
  out.clip = view.from_eye * vec4f(at.from_eye, 1.0);
  out.normal = at.normal;
  out.from_eye = at.from_eye;
  out.material = vertex.material.x;
  out.glow = max(vertex.normal.w, 0.0) * props[vertex.prop].shape.w;
  out.below = at.below;
  out.local = vertex.position;
  out.prop = vertex.prop;
  return out;
}

// Whether a point of an opening module's own frame (at its foot, its width undone) lies between its lips.
fn within_lips(first: u32, count: u32, at: vec2f) -> bool {
  for (var k = first; k + 1u < first + count; k++) {
    let here = lips[k];
    let next = lips[k + 1u];
    if at.x >= here.x && at.x <= next.x {
      let share = (at.x - here.x) / max(next.x - here.x, 1e-4);
      return at.y >= mix(here.y, next.y, share) && at.y <= mix(here.z, next.z, share);
    }
  }
  return false;
}

// The depth a fragment is drawn at: its own, but for a point of a chasm under the ground, where the eye's line to it
// crosses the land at the foot, a little toward the eye (the deeper along the line, the less, so the chasm keeps its
// own order); -1 where that crossing lies outside the lips, or the eye is under the foot, for the land hides it there.
fn chasm_depth(in: Out) -> f32 {
  let prop = props[in.prop];
  if prop.about.x < 0.5 || in.local.z > -0.001 { return in.clip.z; }
  let foot = prop.place.z;
  let at = in.from_eye;
  if foot >= 0.0 || at.z >= foot { return -1.0; }
  let reach = foot / at.z;
  let off = at.xy * reach - prop.place.xy;
  let turn = vec2f(cos(prop.place.w), sin(prop.place.w));
  let own = vec2f(off.x * turn.x + off.y * turn.y, off.y * turn.x - off.x * turn.y) / prop.shape.x;
  let across = mix(0.04, 1.0, prop.shape.y);
  if !within_lips(u32(prop.about.z), u32(prop.about.w), vec2f(own.x, own.y / across)) { return -1.0; }
  let clip = view.from_eye * vec4f(at * (reach * (1.0 - CHASM_LEAD * 0.5 * (1.0 + reach))), 1.0);
  return clip.z / clip.w;
}

fn noise3(at: vec3f) -> f32 {
  return value_noise(at.xy + vec2f(at.z * 1.7, at.z * 0.6));
}

// Each material's colour at a point of the module's own frame, worked so a surface reads as what it is: chalk white
// with grey flint in it, turf mottled green and dry, soil dark, timber weathered grey-brown along its grain, canvas
// oiled tan with darker stains and dirtier toward the ground, iron dark with rust, gold, a heap of grain straw-pale.
fn material_colour(material: u32, local: vec3f, grey: bool) -> vec3f {
  let fine = noise3(local * 9.0);
  let broad = noise3(local * 1.3);
  switch material {
    case ${id('stone')}: { return mix(vec3f(0.5, 0.48, 0.45), vec3f(0.62, 0.6, 0.56), fine); }
    case ${id('trim')}: { return mix(vec3f(0.62, 0.52, 0.3), vec3f(0.8, 0.7, 0.44), fine); }
    case ${id('rubble')}: { return mix(vec3f(0.16, 0.13, 0.1), vec3f(0.26, 0.21, 0.16), fine); }
    case ${id('chalk')}: {
      let flint = step(0.86, noise3(local * 14.0));
      return mix(mix(vec3f(0.78, 0.77, 0.72), vec3f(0.9, 0.89, 0.85), broad), vec3f(0.26, 0.26, 0.29), flint);
    }
    case ${id('turf')}: {
      let dry = smoothstep(0.55, 0.85, broad);
      return mix(mix(vec3f(0.17, 0.28, 0.08), vec3f(0.27, 0.38, 0.13), fine), vec3f(0.42, 0.4, 0.2), dry * 0.6);
    }
    case ${id('timber')}: {
      let grain = value_noise(vec2f(local.x * 2.0 + local.y * 2.0, local.z * 30.0 + local.x * 7.0));
      return mix(vec3f(0.3, 0.25, 0.2), vec3f(0.46, 0.4, 0.33), grain * 0.7 + broad * 0.3);
    }
    case ${id('canvas')}: {
      // Oiled canvas, tan (or the Tithe's grey), weathered darker in broad stains, and dirtier toward the ground.
      // The Tithe's banner is its unmarked grey, as its sails are.
      let cloth = select(
        mix(vec3f(0.5, 0.4, 0.26), vec3f(0.62, 0.52, 0.35), fine),
        mix(vec3f(0.42, 0.42, 0.41), vec3f(0.54, 0.54, 0.52), fine),
        grey,
      );
      let stained = smoothstep(0.55, 0.75, noise3(local * 1.7 + vec3f(3.1, 0.0, 1.3))) * 0.45;
      let dirt = 1.0 - smoothstep(0.0, 0.5, local.z);
      return mix(mix(cloth, cloth * vec3f(0.6, 0.56, 0.5), stained), vec3f(0.27, 0.22, 0.16), dirt * 0.5);
    }
    case ${id('iron')}: { return mix(vec3f(0.17, 0.18, 0.2), vec3f(0.34, 0.2, 0.12), smoothstep(0.6, 0.9, fine) * 0.7); }
    case ${id('gold')}: { return mix(vec3f(0.78, 0.58, 0.2), vec3f(0.92, 0.74, 0.34), fine); }
    default: { return vec3f(0.5, 0.48, 0.44); }
  }
}

fn shade(in: Out) -> vec4f {
  if in.below < -0.01 { discard; }
  var facing = normalize(in.normal);
  // Cloth is one sheet: its back is lit as its front.
  if dot(facing, in.from_eye) > 0.0 { facing = -facing; }
  let direct = max(dot(facing, sky_state.key.xyz), 0.0);
  let sun = select(1.0, sunlit(in.from_eye, facing), direct > 0.0) * sky_dapple(in.from_eye);
  if in.material == CRYSTAL {
    return vec4f(crystal_colour(facing, in.from_eye, in.glow, sun), 1.0);
  }
  let ambient = AMBIENT + BOUNCE * (1.0 - abs(facing.z));
  let light = sky_ambient(facing) * (ambient / AMBIENT) + sky_direct(facing, sun) * ((1.0 - ambient) / 0.65);
  var colour = material_colour(in.material, in.local, props[in.prop].look.x > 0.5) * (light + sky_lamps(in.from_eye, facing));
  // Metal catches the sun.
  if in.material == ${id('iron')} || in.material == ${id('gold')} {
    let glint = pow(max(dot(reflect(normalize(in.from_eye), facing), sky_state.key.xyz), 0.0), 24.0) * sun;
    colour += sky_state.key_light.rgb * glint * select(0.35, 0.9, in.material == ${id('gold')});
  }
  return vec4f(colour, 1.0);
}

@fragment fn prop_fragment(in: Out) -> @location(0) vec4f {
  return shade(in);
}

// A module that opens: its chasm seen through its mouth (chasm_depth).
struct Deep { @location(0) colour: vec4f, @builtin(frag_depth) depth: f32 }
@fragment fn chasm_fragment(in: Out) -> Deep {
  let depth = chasm_depth(in);
  if depth < 0.0 { discard; }
  return Deep(shade(in), depth);
}

// The crystal's light, where its core glows brightest (the crystal alone is drawn into it).
@fragment fn light_fragment(in: Out) -> Deep {
  let depth = chasm_depth(in);
  if in.material != CRYSTAL || in.below < -0.01 || depth < 0.0 { discard; }
  return Deep(light_of(vec3f(${CRYSTAL_HOT.join(', ')}) * in.glow, 1.0), depth);
}
`;

export const PROPS_CAST_SHADER = /* wgsl */ `
${SHADOW_CAST_WGSL}
${PLACE_WGSL}
@vertex fn cast_vertex(vertex: Vertex) -> @builtin(position) vec4f {
  return shadow.from_eye * vec4f(placed(vertex).from_eye, 1.0);
}
`;

/** A module's surfaces made ready to draw: its vertices and triangles (its crystal's last, from `crystalFrom`), its
 *  height, and where its lips stand in the lips' list, if it opens the land. */
type Made = {
  readonly vertices: GPUBuffer;
  readonly indices: GPUBuffer;
  readonly count: number;
  readonly crystalFrom: number;
  readonly height: number;
  readonly lips: { readonly first: number; readonly count: number } | null;
};

/** The public events' props, drawn as one of the scene's drawers from the list `set` hands it each frame. */
export class EventPropsDraw implements Drawer {
  private readonly gpu: Gpu;
  /** The pipelines, made the first frame there are props to draw: most of the game's places have none. */
  private pipes: Record<'draw' | 'chasm' | 'cast' | 'light', GPURenderPipeline> | null = null;
  private readonly viewLayout: GPUBindGroupLayout;
  private readonly view: GPUBuffer;
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
  /** The frame the table was last written for, and the props it holds, each with its row. */
  private written: { fromEye: Float32Array | null; props: readonly EventProp[] } = { fromEye: null, props: [] };

  constructor(gpu: Gpu) {
    this.gpu = gpu;
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
    this.view = device.createBuffer({ size: 64, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
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

  /** The props the next frames draw (eventProps.ts), and the lamps their crystal lights. */
  set(props: readonly EventProp[]): void {
    this.props = props;
    EVENT_LAMPS.current = props.length > 0 ? propLamps(props) : NO_LAMPS;
  }

  /** A module made ready to draw, the first time it is drawn after its meshes have come; none before. */
  private madeOf(name: EventProp['module']): Made | null {
    const known = this.made.get(name);
    if (known) return known;
    if (!this.ready) return null;
    const number = moduleNumber(name);
    const packed = number >= 0 ? packModule(number) : null;
    if (!packed) return null;
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
      rows[first + 11] = made.lips?.count ?? 0;
      rows[first + 12] = GREY_CANVAS.has(prop.module) ? 1 : 0;
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
    for (const [prop] of drawn)
      shadow.tally(prop.at[0], prop.at[1], prop.at[2], prop.turn, prop.scale, prop.rise, prop.lid);
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
    _time: number,
    shadow: ShadowMap,
  ): void {
    const drawn = this.prepared(fromEye, shot.eye);
    if (drawn.length === 0 || !this.tableGroup) return;
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
