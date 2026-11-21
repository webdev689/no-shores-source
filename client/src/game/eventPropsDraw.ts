// The public events' props on the GPU: each module's surfaces in one buffer, every prop a draw of its module with its
// place, turn, scale, rise, lid and glow read from a table by its instance. Lit as the city is (the sky, the sun's
// shadows, the lamps), each material its own colour worked by code over the module's own frame, the Lattice's crystal
// as crystal.ts draws it, and its brightest crystal given into the light layer. A module that opens (the fissure)
// first opens the land along its mouth: the scene's depth there is set far, so its chasm under the ground is drawn.
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import type { Drawer } from './scene.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { LIGHT_DEPTH, LIGHT_TARGET, LIGHT_WGSL } from '../combat/lightLayer.ts';
import { SHADOW_CAST_WGSL, SHADOW_WGSL, ShadowMap, shadowLayouts } from '../shadow.ts';
import { EVENT_LAMPS } from '../sky/lamps.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { CRYSTAL_HOT, CRYSTAL_WGSL } from '../city/crystal.ts';
import { type EventProp, OPENS, type PropModule, propLamps } from '../city/eventProps.ts';
import { loadModules, moduleMesh, moduleMouth, moduleNumber, moduleShape } from '../city/modules.ts';

/** The materials a module's surface may wear, numbered as the shader knows them (tools/modules/kit.py MATERIALS). */
const MATERIALS = [
  'stone',
  'trim',
  'rubble',
  'chalk',
  'turf',
  'timber',
  'canvas',
  'iron',
  'gold',
  'crystal',
  'paving',
] as const;
const CRYSTAL_ID = MATERIALS.indexOf('crystal');

/** A vertex: its position (3 floats), its normal and glow (4 signed bytes) and its material (4 bytes, the first). */
const STRIDE = 20;
/** A prop's row in the table: where it stands from the eye and its turn; its scale, rise, lid and glow; whether it
 *  opens, and its module's height. */
const PROP_FLOATS = 12;

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
struct Prop { place: vec4f, shape: vec4f, about: vec4f }
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
const CRYSTAL = ${CRYSTAL_ID}u;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) from_eye: vec3f,
  @location(2) @interpolate(flat) material: u32,
  @location(3) glow: f32,
  @location(4) below: f32,
  @location(5) local: vec3f,
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
  return out;
}

fn noise3(at: vec3f) -> f32 {
  return value_noise(at.xy + vec2f(at.z * 1.7, at.z * 0.6));
}

// Each material's colour at a point of the module's own frame, worked so a surface reads as what it is: chalk white
// with grey flint in it, turf mottled green and dry, soil dark, timber weathered grey-brown along its grain, canvas
// oiled tan with darker stains and dirtier toward the ground, iron dark with rust, gold, a heap of grain straw-pale.
fn material_colour(material: u32, local: vec3f) -> vec3f {
  let fine = noise3(local * 9.0);
  let broad = noise3(local * 1.3);
  switch material {
    case 0u: { return mix(vec3f(0.5, 0.48, 0.45), vec3f(0.62, 0.6, 0.56), fine); }
    case 1u: { return mix(vec3f(0.62, 0.52, 0.3), vec3f(0.8, 0.7, 0.44), fine); }
    case 2u: { return mix(vec3f(0.16, 0.13, 0.1), vec3f(0.26, 0.21, 0.16), fine); }
    case 3u: {
      let flint = step(0.86, noise3(local * 14.0));
      return mix(mix(vec3f(0.78, 0.77, 0.72), vec3f(0.9, 0.89, 0.85), broad), vec3f(0.26, 0.26, 0.29), flint);
    }
    case 4u: {
      let dry = smoothstep(0.55, 0.85, broad);
      return mix(mix(vec3f(0.17, 0.28, 0.08), vec3f(0.27, 0.38, 0.13), fine), vec3f(0.42, 0.4, 0.2), dry * 0.6);
    }
    case 5u: {
      let grain = value_noise(vec2f(local.x * 2.0 + local.y * 2.0, local.z * 30.0 + local.x * 7.0));
      return mix(vec3f(0.3, 0.25, 0.2), vec3f(0.46, 0.4, 0.33), grain * 0.7 + broad * 0.3);
    }
    case 6u: {
      // Oiled canvas, tan, weathered darker in broad stains, and dirtier toward the ground.
      let cloth = mix(vec3f(0.5, 0.4, 0.26), vec3f(0.62, 0.52, 0.35), fine);
      let stained = smoothstep(0.55, 0.75, noise3(local * 1.7 + vec3f(3.1, 0.0, 1.3))) * 0.45;
      let dirt = 1.0 - smoothstep(0.0, 0.5, local.z);
      return mix(mix(cloth, cloth * vec3f(0.6, 0.56, 0.5), stained), vec3f(0.27, 0.22, 0.16), dirt * 0.5);
    }
    case 7u: { return mix(vec3f(0.17, 0.18, 0.2), vec3f(0.34, 0.2, 0.12), smoothstep(0.6, 0.9, fine) * 0.7); }
    case 8u: { return mix(vec3f(0.78, 0.58, 0.2), vec3f(0.92, 0.74, 0.34), fine); }
    default: { return vec3f(0.5, 0.48, 0.44); }
  }
}

@fragment fn prop_fragment(in: Out) -> @location(0) vec4f {
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
  var colour = material_colour(in.material, in.local) * (light + sky_lamps(in.from_eye, facing));
  // Metal catches the sun.
  if in.material == 7u || in.material == 8u {
    let glint = pow(max(dot(reflect(normalize(in.from_eye), facing), sky_state.key.xyz), 0.0), 24.0) * sun;
    colour += sky_state.key_light.rgb * glint * select(0.35, 0.9, in.material == 8u);
  }
  return vec4f(colour, 1.0);
}

// The land opened along a mouth: the scene's depth set far there, so the chasm under it is drawn.
struct Opened { @builtin(frag_depth) depth: f32 }
@fragment fn open_fragment(in: Out) -> Opened {
  return Opened(0.0);
}

// The crystal's light, where its core glows brightest.
@fragment fn light_fragment(in: Out) -> @location(0) vec4f {
  if in.material != CRYSTAL || in.below < -0.01 { discard; }
  return light_of(vec3f(${CRYSTAL_HOT.join(', ')}) * in.glow, 1.0);
}
`;

export const PROPS_CAST_SHADER = /* wgsl */ `
${SHADOW_CAST_WGSL}
${PLACE_WGSL}
@vertex fn cast_vertex(vertex: Vertex) -> @builtin(position) vec4f {
  return shadow.from_eye * vec4f(placed(vertex).from_eye, 1.0);
}
`;

/** A module's surfaces made ready to draw: its vertices and triangles, and its mouth's, if it opens the land. */
type Made = {
  readonly vertices: GPUBuffer;
  readonly indices: GPUBuffer;
  readonly count: number;
  readonly height: number;
  readonly mouth: { readonly vertices: GPUBuffer; readonly count: number } | null;
};

/** A module's groups packed into one vertex list (each vertex its material) and one triangle list. */
export function packModule(module: number): { vertices: ArrayBuffer; indices: Uint32Array } | null {
  const { materials } = moduleShape(module);
  const meshes = materials.map((_material, group) => moduleMesh(module, group));
  if (meshes.length === 0 || meshes.some((mesh) => !mesh)) return null;
  const total = meshes.reduce((sum, mesh) => sum + (mesh?.positions.length ?? 0) / 3, 0);
  const vertices = new ArrayBuffer(total * STRIDE);
  const view = new DataView(vertices);
  const indices: number[] = [];
  let base = 0;
  meshes.forEach((mesh, group) => {
    if (!mesh) return;
    const material = Math.max(0, MATERIALS.indexOf(materials[group] as (typeof MATERIALS)[number]));
    const count = mesh.positions.length / 3;
    for (let vertex = 0; vertex < count; vertex++) {
      const start = (base + vertex) * STRIDE;
      for (let axis = 0; axis < 3; axis++) {
        view.setFloat32(start + axis * 4, mesh.positions[vertex * 3 + axis] ?? 0, true);
        view.setInt8(start + 12 + axis, mesh.normals[vertex * 3 + axis] ?? 0);
      }
      view.setInt8(start + 15, mesh.glows[vertex] ?? 0);
      view.setUint8(start + 16, material);
    }
    for (const index of mesh.triangles) indices.push(index + base);
    base += count;
  });
  return { vertices, indices: Uint32Array.from(indices) };
}

/** A module's mouth as triangles between its lips, at its foot, in the vertex layout (pointing up, no glow). */
export function packMouth(module: number): ArrayBuffer | null {
  const lips = moduleMouth(module);
  const [north, south] = lips ?? [];
  if (!north || !south || north.length !== south.length || north.length < 2) return null;
  const corners: (readonly [number, number])[] = [];
  for (let k = 0; k + 1 < north.length; k++) {
    const [here, next, across, back] = [north[k], north[k + 1], south[k + 1], south[k]];
    if (here && next && across && back) corners.push(here, next, across, here, across, back);
  }
  const vertices = new ArrayBuffer(corners.length * STRIDE);
  const view = new DataView(vertices);
  corners.forEach(([x, y], corner) => {
    view.setFloat32(corner * STRIDE, x, true);
    view.setFloat32(corner * STRIDE + 4, y, true);
    view.setInt8(corner * STRIDE + 14, 127);
  });
  return vertices;
}

/** The public events' props, drawn as one of the scene's drawers from the list `set` hands it each frame. */
export class EventPropsDraw implements Drawer {
  private readonly gpu: Gpu;
  private readonly draw: GPURenderPipeline;
  private readonly open: GPURenderPipeline;
  private readonly cast: GPURenderPipeline;
  private readonly light: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private readonly propsLayout: GPUBindGroupLayout;
  private table: GPUBuffer | null = null;
  private tableGroup: GPUBindGroup | null = null;
  private readonly made = new Map<PropModule, Made>();
  private props: readonly EventProp[] = [];
  /** The table's rows as written, kept between frames so a frame allocates none. */
  private rows = new Float32Array(16 * PROP_FLOATS);
  private ready = false;
  /** The frame the table was last written for, and the props it holds, each with its row. */
  private written: {
    fromEye: Float32Array;
    props: readonly EventProp[];
    drawn: [EventProp, Made, number][];
  } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: PROPS_SHADER });
    const castModule = device.createShaderModule({ code: PROPS_CAST_SHADER });
    const viewLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} }],
    });
    this.propsLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: { type: 'read-only-storage' } }],
    });
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
    this.draw = device.createRenderPipeline({
      layout,
      vertex,
      fragment: { module, entryPoint: 'prop_fragment', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true, REVERSED_DEPTH.compare),
      multisample: { count: SAMPLES },
    });
    // shortcut: the mouth opens the depth of whatever is drawn before it there, a rise of the land or a layout's piece
    // standing in front alike, as the depth test reads the depth the mouth writes; the events stand on clear ground.
    // A stencil would open the land alone.
    this.open = device.createRenderPipeline({
      layout,
      vertex,
      fragment: { module, entryPoint: 'open_fragment', targets: [{ format: gpu.format, writeMask: 0 }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true, 'always'),
      multisample: { count: SAMPLES },
    });
    this.light = device.createRenderPipeline({
      layout,
      vertex,
      fragment: { module, entryPoint: 'light_fragment', targets: [LIGHT_TARGET] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: LIGHT_DEPTH,
    });
    this.cast = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout, shadows.caster, this.propsLayout] }),
      vertex: { module: castModule, entryPoint: 'cast_vertex', buffers: [VERTEX_LAYOUT] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.view = device.createBuffer({ size: 64, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.viewGroup = device.createBindGroup({
      layout: viewLayout,
      entries: [{ binding: 0, resource: { buffer: this.view } }],
    });
    void loadModules().then(() => {
      this.ready = true;
    });
  }

  /** The props the next frames draw (eventProps.ts), and the lamps their crystal lights. */
  set(props: readonly EventProp[]): void {
    this.props = props;
    EVENT_LAMPS.current = propLamps(props);
  }

  /** A module made ready to draw, the first time it is drawn after its meshes have come; none before. */
  private madeOf(name: PropModule): Made | null {
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
    const mouth = OPENS.has(name) ? packMouth(number) : null;
    const made: Made = {
      vertices: buffer(packed.vertices, BUFFER_USAGE.vertex),
      indices: buffer(packed.indices, BUFFER_USAGE.index),
      count: packed.indices.length,
      height: moduleShape(number).size[2] ?? 1,
      mouth: mouth ? { vertices: buffer(mouth, BUFFER_USAGE.vertex), count: mouth.byteLength / STRIDE } : null,
    };
    this.made.set(name, made);
    return made;
  }

  /** Writes the view and the props' table for a frame seen from `eye`, and answers the props ready to draw, each with
   *  its row in the table. */
  private prepared(fromEye: Float32Array, eye: readonly [number, number, number]): [EventProp, Made, number][] {
    if (this.written?.fromEye === fromEye && this.written.props === this.props) return this.written.drawn;
    const drawn: [EventProp, Made, number][] = [];
    this.written = { fromEye, props: this.props, drawn };
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
      const at = row * PROP_FLOATS;
      rows[at] = prop.at[0] - eye[0];
      rows[at + 1] = prop.at[1] - eye[1];
      rows[at + 2] = prop.at[2] - eye[2];
      rows[at + 3] = prop.turn;
      rows[at + 4] = prop.scale;
      rows[at + 5] = prop.rise;
      rows[at + 6] = prop.lid;
      rows[at + 7] = prop.glow;
      rows[at + 8] = OPENS.has(prop.module) ? 1 : 0;
      rows[at + 9] = made.height;
    });
    if (!this.table || this.table.size < rows.byteLength) {
      this.table?.destroy();
      const size = Math.max(4096, 2 ** Math.ceil(Math.log2(rows.byteLength)));
      this.table = this.gpu.device.createBuffer({ size, usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination });
      this.tableGroup = this.gpu.device.createBindGroup({
        layout: this.propsLayout,
        entries: [{ binding: 0, resource: { buffer: this.table } }],
      });
    }
    this.gpu.device.queue.writeBuffer(this.table, 0, rows);
    return drawn;
  }

  private drawEach(pass: GPURenderPassEncoder, drawn: readonly [EventProp, Made, number][]): void {
    for (const [, made, row] of drawn) {
      pass.setVertexBuffer(0, made.vertices);
      pass.setIndexBuffer(made.indices, 'uint32');
      pass.drawIndexed(made.count, 1, 0, 0, row);
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
    pass.setPipeline(this.cast);
    pass.setBindGroup(0, this.viewGroup);
    pass.setBindGroup(1, shadow.casterGroup(this.cast));
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
    const opening = drawn.filter(([, made]) => made.mouth);
    if (opening.length > 0) {
      pass.setPipeline(this.open);
      pass.setBindGroup(1, shadow.receiverGroup(this.open));
      for (const [, made, row] of opening)
        if (made.mouth) {
          pass.setVertexBuffer(0, made.mouth.vertices);
          pass.draw(made.mouth.count, 1, 0, row);
        }
    }
    pass.setPipeline(this.draw);
    pass.setBindGroup(1, shadow.receiverGroup(this.draw));
    this.drawEach(pass, drawn);
  }

  lightInto(pass: GPURenderPassEncoder, fromEye: Float32Array): void {
    const drawn = this.written?.fromEye === fromEye ? this.written.drawn : [];
    if (drawn.length === 0 || !this.tableGroup) return;
    pass.setPipeline(this.light);
    pass.setBindGroup(0, this.viewGroup);
    pass.setBindGroup(2, this.tableGroup);
    skyUniformFor(this.gpu.device).bindShared(pass);
    pass.setBindGroup(1, ShadowMap.none(this.gpu).receiverGroup(this.light));
    this.drawEach(pass, drawn);
  }
}
