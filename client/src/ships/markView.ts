import { skyUniformFor } from '../sky/skyUniform.ts';
import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import type { Mark } from './effects.ts';
import type { ShipCamera } from './shipView.ts';

/** The most marks drawn in a frame: past it the rest wait. */
export const MOST_MARKS = 2048;
const INSTANCE_FLOATS = 8;

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

export const MARK_SHADER = /* wgsl */ `
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
  @location(2) from_eye: vec3f,
};

@vertex
fn vertex_main(@location(0) corner: vec3f, @location(1) place: vec4f, @location(2) colour: vec4f) -> Drawn {
  var drawn: Drawn;
  drawn.from_eye = place.xyz - camera.eye.xyz + corner * place.w;
  drawn.clip = camera.from_eye * vec4f(drawn.from_eye, 1.0);
  drawn.normal = corner;
  drawn.colour = colour.rgb;
  return drawn;
}

@fragment
fn fragment_main(drawn: Drawn) -> @location(0) vec4f {
  let normal = normalize(drawn.normal);
  // Marks were lit a little brighter than the land: AMBIENT against the land's 0.35.
  let direct = sky_direct(normal, sky_dapple(drawn.from_eye)) * ((1.0 - AMBIENT) / 0.65);
  let light = sky_ambient(normal) * (AMBIENT / 0.35) + direct + sky_lamps(drawn.from_eye, normal);
  return vec4f(drawn.colour * light, 1.0);
}
`;

/** Draws small spheres (balls, a lay's arcs, smoke and spray) into the land's pass, lit as the land is. */
export class MarkView {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly corners: GPUBuffer;
  private readonly faces: GPUBuffer;
  private readonly faceCount: number;
  private readonly instances: GPUBuffer;
  private readonly uniforms: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;

  constructor(gpu: Gpu) {
    this.device = gpu.device;
    const shape = sphere();
    const module = gpu.device.createShaderModule({ code: MARK_SHADER });
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertex_main',
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          {
            arrayStride: INSTANCE_FLOATS * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x4' },
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
    this.corners = buffer(shape.corners, BUFFER_USAGE.vertex);
    const padded = new Uint16Array(Math.ceil(shape.faces.length / 2) * 2);
    padded.set(shape.faces);
    this.faces = buffer(padded, BUFFER_USAGE.index);
    this.faceCount = shape.faces.length;
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
    const values = new Float32Array(count * INSTANCE_FLOATS);
    for (let index = 0; index < count; index++) {
      const mark = marks[index];
      if (!mark) continue;
      values.set([mark.x, mark.y, mark.z, mark.radius, ...mark.colour, 1], index * INSTANCE_FLOATS);
    }
    this.device.queue.writeBuffer(this.instances, 0, values);
    const uniforms = new Float32Array(20);
    uniforms.set(camera.fromEye);
    uniforms.set([...camera.eye, 0], 16);
    this.device.queue.writeBuffer(this.uniforms, 0, uniforms);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    skyUniformFor(this.device).bindAuto(pass, this.pipeline, [1, 2]);
    pass.setVertexBuffer(0, this.corners);
    pass.setVertexBuffer(1, this.instances);
    pass.setIndexBuffer(this.faces, 'uint16');
    pass.drawIndexed(this.faceCount, count);
  }
}
