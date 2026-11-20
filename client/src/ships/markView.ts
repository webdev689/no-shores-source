import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import type { Mark } from './effects.ts';
import type { ShipCamera } from './shipView.ts';

/** The most marks drawn in a frame: past it the rest wait. */
export const MOST_MARKS = 2048;
const INSTANCE_FLOATS = 8;
/** The shapes a mark is drawn as, a mesh each. */
export const MARK_SHAPES = ['ball', 'box', 'chest', 'drum'] as const;
export type MarkShape = (typeof MARK_SHAPES)[number];

/** A mesh of a shape: its corners, each with its normal (six floats a corner), and its faces. */
interface ShapeMesh {
  readonly corners: Float32Array<ArrayBuffer>;
  readonly faces: Uint16Array<ArrayBuffer>;
}

/** A box `size` across (half-extents along x, y, z), a face's four corners its own so each is lit flat. */
export function box(size: readonly [number, number, number]): ShapeMesh {
  const corners: number[] = [];
  const faces: number[] = [];
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [1, -1]) {
      const [across, up] = [(axis + 1) % 3, (axis + 2) % 3];
      const first = corners.length / 6;
      for (const [one, other] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const point = [0, 0, 0];
        const normal = [0, 0, 0];
        point[axis] = sign * size[axis];
        point[across] = one * size[across];
        point[up] = other * size[up];
        normal[axis] = sign;
        corners.push(...point, ...normal);
      }
      faces.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  return { corners: new Float32Array(corners), faces: new Uint16Array(faces) };
}

/** A drum lying along x, `length` long either way of its middle and of unit radius: its side in `SIDES` staves and
 *  its two ends. */
export function drum(length: number): ShapeMesh {
  const SIDES = 12;
  const corners: number[] = [];
  const faces: number[] = [];
  for (let side = 0; side <= SIDES; side++) {
    const turn = (side / SIDES) * 2 * Math.PI;
    const [y, z] = [Math.cos(turn), Math.sin(turn)];
    corners.push(-length, y, z, 0, y, z, length, y, z, 0, y, z);
  }
  for (let side = 0; side < SIDES; side++) {
    const spot = side * 2;
    faces.push(spot, spot + 1, spot + 3, spot, spot + 3, spot + 2);
  }
  for (const end of [-1, 1]) {
    const middle = corners.length / 6;
    corners.push(end * length, 0, 0, end, 0, 0);
    for (let side = 0; side <= SIDES; side++) {
      const turn = (side / SIDES) * 2 * Math.PI;
      corners.push(end * length, Math.cos(turn), Math.sin(turn), end, 0, 0);
    }
    for (let side = 0; side < SIDES; side++) faces.push(middle, middle + 1 + side, middle + 2 + side);
  }
  return { corners: new Float32Array(corners), faces: new Uint16Array(faces) };
}

/** Every shape's mesh, in `MARK_SHAPES`' order: a crate is a cube, a chest longer than it is deep, a barrel a drum. */
function shapes(): ShapeMesh[] {
  const ball = sphere();
  const lit = new Float32Array((ball.corners.length / 3) * 6);
  for (let corner = 0; corner < ball.corners.length / 3; corner++) {
    const point = ball.corners.subarray(corner * 3, corner * 3 + 3);
    lit.set([...point, ...point], corner * 6);
  }
  return [{ corners: lit, faces: ball.faces }, box([1, 1, 1]), box([1.4, 0.9, 0.8]), drum(1.3)];
}

/** A sphere's corners and faces: an icosahedron split once, each corner pushed out to the unit sphere. Both sides of
 *  a face are drawn (it is closed, so the depth test hides its back), and each is lit by its corner's own normal. */
export function sphere(): { readonly corners: Float32Array<ArrayBuffer>; readonly faces: Uint16Array<ArrayBuffer> } {
  const golden = (1 + Math.sqrt(5)) / 2;
  const points: number[][] = [
    [-1, golden, 0],
    [1, golden, 0],
    [-1, -golden, 0],
    [1, -golden, 0],
    [0, -1, golden],
    [0, 1, golden],
    [0, -1, -golden],
    [0, 1, -golden],
    [golden, 0, -1],
    [golden, 0, 1],
    [-golden, 0, -1],
    [-golden, 0, 1],
  ];
  const twenty = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const middles = new Map<string, number>();
  const middle = (one: number, other: number) => {
    const key = one < other ? `${one}:${other}` : `${other}:${one}`;
    const known = middles.get(key);
    if (known !== undefined) return known;
    const [first = [0, 0, 0], second = [0, 0, 0]] = [points[one], points[other]];
    points.push(first.map((value, axis) => (value + (second[axis] ?? 0)) / 2));
    middles.set(key, points.length - 1);
    return points.length - 1;
  };
  const faces: number[] = [];
  for (const [one = 0, two = 0, three = 0] of twenty) {
    const [first, second, third] = [middle(one, two), middle(two, three), middle(three, one)];
    faces.push(one, first, third, two, second, first, three, third, second, first, second, third);
  }
  const corners = points.flatMap((point) => {
    const length = Math.hypot(...point);
    return point.map((value) => value / length);
  });
  return { corners: new Float32Array(corners), faces: new Uint16Array(faces) };
}

const MARK_SHADER = /* wgsl */ `
${SHARED_WGSL}
const AMBIENT = 0.45;

struct Camera {
  from_eye: mat4x4f,
  eye: vec4f,
};

@group(0) @binding(0) var<uniform> camera: Camera;

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) colour: vec3f,
};

@vertex
fn vertex_main(
  @location(0) corner: vec3f,
  @location(1) facing: vec3f,
  @location(2) place: vec4f,
  @location(3) colour: vec4f,
) -> Drawn {
  var drawn: Drawn;
  // A mark's yaw (its colour's fourth) turns it about the upright.
  let turn = vec2f(cos(colour.w), sin(colour.w));
  let turned = vec3f(corner.x * turn.x - corner.y * turn.y, corner.x * turn.y + corner.y * turn.x, corner.z);
  drawn.clip = camera.from_eye * vec4f(place.xyz - camera.eye.xyz + turned * place.w, 1.0);
  drawn.normal = vec3f(facing.x * turn.x - facing.y * turn.y, facing.x * turn.y + facing.y * turn.x, facing.z);
  drawn.colour = colour.rgb;
  return drawn;
}

@fragment
fn fragment_main(drawn: Drawn) -> @location(0) vec4f {
  let light = AMBIENT + (1.0 - AMBIENT) * max(dot(normalize(drawn.normal), SUN), 0.0);
  return vec4f(drawn.colour * light, 1.0);
}
`;

/** Draws small shapes (balls, a lay's arcs, smoke, spray and splinters as spheres; flotsam's crates, chests and
 *  barrels) into the land's pass, lit as the land is. */
export class MarkView {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly corners: GPUBuffer;
  private readonly faces: GPUBuffer;
  /** Each shape's faces in the shared buffers: its first face index, its count and its first corner. */
  private readonly meshes: { readonly first: number; readonly count: number; readonly base: number }[];
  private readonly instances: GPUBuffer;
  private readonly uniforms: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;

  constructor(gpu: Gpu) {
    this.device = gpu.device;
    const meshes = shapes();
    const module = gpu.device.createShaderModule({ code: MARK_SHADER });
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertex_main',
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
          },
          {
            arrayStride: INSTANCE_FLOATS * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x4' },
              { shaderLocation: 3, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: SAMPLES },
    });
    const buffer = (data: Float32Array | Uint16Array, usage: number) => {
      const made = gpu.device.createBuffer({
        size: Math.ceil(data.byteLength / 4) * 4,
        usage: usage | BUFFER_USAGE.copyDestination,
      });
      gpu.device.queue.writeBuffer(made, 0, data.buffer, 0, Math.ceil(data.byteLength / 4) * 4);
      return made;
    };
    const corners = new Float32Array(meshes.reduce((sum, mesh) => sum + mesh.corners.length, 0));
    const faceCount = meshes.reduce((sum, mesh) => sum + mesh.faces.length, 0);
    const padded = new Uint16Array(Math.ceil(faceCount / 2) * 2);
    let [cornerAt, faceAt] = [0, 0];
    this.meshes = meshes.map((mesh) => {
      corners.set(mesh.corners, cornerAt);
      padded.set(mesh.faces, faceAt);
      const placed = { first: faceAt, count: mesh.faces.length, base: cornerAt / 6 };
      [cornerAt, faceAt] = [cornerAt + mesh.corners.length, faceAt + mesh.faces.length];
      return placed;
    });
    this.corners = buffer(corners, BUFFER_USAGE.vertex);
    this.faces = buffer(padded, BUFFER_USAGE.index);
    this.instances = gpu.device.createBuffer({
      size: MOST_MARKS * INSTANCE_FLOATS * 4,
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    this.uniforms = gpu.device.createBuffer({
      size: 20 * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.bindGroup = gpu.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniforms } }],
    });
  }

  /** Draws `marks` (window metres, heights as drawn) into a pass the land's pipelines draw into. */
  drawInto(pass: GPURenderPassEncoder, marks: readonly Mark[], camera: ShipCamera): void {
    const count = Math.min(marks.length, MOST_MARKS);
    if (count === 0) return;
    // Grouped by shape, each shape's marks one run of instances.
    const sorted = marks
      .slice(0, count)
      .map((mark) => ({ mark, shape: Math.max(0, MARK_SHAPES.indexOf(mark.shape ?? 'ball')) }))
      .sort((one, other) => one.shape - other.shape);
    const values = new Float32Array(count * INSTANCE_FLOATS);
    sorted.forEach(({ mark }, index) =>
      values.set([mark.x, mark.y, mark.z, mark.radius, ...mark.colour, mark.yaw ?? 0], index * INSTANCE_FLOATS),
    );
    this.device.queue.writeBuffer(this.instances, 0, values);
    const uniforms = new Float32Array(20);
    uniforms.set(camera.fromEye);
    uniforms.set([...camera.eye, 0], 16);
    this.device.queue.writeBuffer(this.uniforms, 0, uniforms);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.corners);
    pass.setVertexBuffer(1, this.instances);
    pass.setIndexBuffer(this.faces, 'uint16');
    let first = 0;
    this.meshes.forEach((mesh, shape) => {
      let last = first;
      while (last < sorted.length && sorted[last]?.shape === shape) last++;
      if (last > first) pass.drawIndexed(mesh.count, last - first, mesh.first, mesh.base, first);
      first = last;
    });
  }
}
