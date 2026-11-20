// The aim as DFO draws it: each gun's arc a ribbon of one width on the screen at any distance, dashed by the metres
// flown and marching out; each landing a ring flat on the sea and a post of light over it, so a fall reads at 150 m; a
// strike's mark where a ball meets a hull; in three tones (laid, hot on target, idle while the side cannot fire). It is
// drawn over the finished picture, after the water (which would paint its sky and surface over it), tested by hand
// against the scene's depth: the ring blended, the rest light added onto the frame. The quads are laid out here each
// frame, one program draws them all.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import type { ShipCamera } from './shipView.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number, number];

/** What the aim shows, window metres with heights as drawn: each gun's flight to where it stops, where the volley
 *  falls on the sea and where it meets a hull, the landing ring's radius, and its tone. */
export interface AimDrawn {
  readonly arcs: readonly (readonly Point[])[];
  readonly zone: readonly Point[];
  readonly strikes: readonly Point[];
  readonly radius: number;
  readonly tone: AimToneName;
}

/** DFO's aim tones, each colour's fourth its strength: brass laid, red when its guns strike a ship, grey while the
 *  side cannot fire (loading, braced, crippled: where it would fall, not a promise). */
export const AIM_TONES = {
  laid: {
    zone: [0.98, 0.84, 0.46, 0.42],
    arc: [1, 0.86, 0.55, 0.4],
    post: [1, 0.84, 0.5, 0.3],
    strike: [1, 0.8, 0.45, 0.5],
  },
  hot: {
    zone: [0.95, 0.18, 0.12, 0.55],
    arc: [1, 0.35, 0.22, 0.55],
    post: [1, 0.3, 0.2, 0.36],
    strike: [1, 0.26, 0.16, 0.8],
  },
  idle: {
    zone: [0.62, 0.64, 0.66, 0.3],
    arc: [0.62, 0.64, 0.66, 0.22],
    post: [0.6, 0.62, 0.64, 0.16],
    strike: [0.62, 0.64, 0.66, 0.35],
  },
} as const satisfies Record<string, Record<'zone' | 'arc' | 'post' | 'strike', Colour>>;
export type AimToneName = keyof typeof AIM_TONES;

/** An arc is this share of the view's height across at any distance; dashed every `dashM` of flight, its second half
 *  `dashDim` as strong, marching out at `dashSpeed` metres a second, as DFO's arcs are. */
export const ARC = { widthVh: 0.003, dashM: 6, dashDim: 0.35, dashSpeed: 9 } as const;
/** A landing's post of light: half its width and half its height; a strike mark's half size; how far over the sea a
 *  ring lies, metres. */
export const POST = { halfW: 0.45, halfH: 1.7 } as const;
export const STRIKE_HALF_M = 1.1;
const RING_OVER_M = 0.06;
/** A landing's ring, DFO's foam ring: brightest this share of its radius out, falling to nothing this far either side
 *  of it, and nothing past its edge. */
const RING = { peak: 0.7, half: 0.28 } as const;

/** How strong the ring is drawn `reach` (a share of its radius) out from its middle: the shader's own law. */
export function ringStrength(reach: number): number {
  return reach < 1 ? Math.max(0, 1 - Math.abs(reach - RING.peak) / RING.half) : 0;
}

/** The pictures a quad wears, drawn in its fragment: the arc's line, the ring, a soft dot. */
const PICTURE = { line: 0, ring: 1, soft: 2 } as const;
/** Floats a corner: its place, its picture's coordinates, its colour and its picture. */
export const AIM_FLOATS = 10;
/** The most quads a frame draws. */
const MOST_QUADS = 2048;

/** The camera's frame read off its matrix from the eye: its right and up (unit, in the world), the view's height a
 *  metre out, and the depth of a point (metres off the eye) along the look. */
function frameOf(fromEye: Float32Array) {
  const row = (index: number): Point => [fromEye[index] ?? 0, fromEye[4 + index] ?? 0, fromEye[8 + index] ?? 0];
  const unit = (vector: Point): Point => {
    const length = Math.hypot(...vector) || 1;
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  };
  const [across, upright, deep] = [row(0), row(1), row(3)];
  return {
    right: unit(across),
    up: unit(upright),
    viewHeight: 2 / (Math.hypot(...upright) || 1),
    depth: (point: Point) => deep[0] * point[0] + deep[1] * point[1] + deep[2] * point[2] + (fromEye[15] ?? 0),
  };
}

const minus = (one: Point, other: Point): Point => [one[0] - other[0], one[1] - other[1], one[2] - other[2]];
const scaled = (vector: Point, factor: number): Point => [vector[0] * factor, vector[1] * factor, vector[2] * factor];
const cross = (one: Point, other: Point): Point => [
  one[1] * other[2] - one[2] * other[1],
  one[2] * other[0] - one[0] * other[2],
  one[0] * other[1] - one[1] * other[0],
];

/** The corners the aim lays this frame at `time` seconds, from `camera` (window metres): the blended ring first, then
 *  the added light; and how many corners each is. */
export function aimCorners(
  aim: AimDrawn,
  camera: ShipCamera,
  time: number,
): { readonly corners: Float32Array; readonly blended: number; readonly added: number } {
  const tone = AIM_TONES[aim.tone];
  const frame = frameOf(camera.fromEye);
  const fromEye = (point: Point) => minus(point, camera.eye);
  const corners: number[] = [];
  const corner = (point: Point, picX: number, picY: number, colour: Colour, picture: number) =>
    corners.push(...point, picX, picY, ...colour, picture);
  /** A quad round `middle` spanning `across` and `along` either way. */
  const quad = (middle: Point, across: Point, along: Point, colour: Colour, picture: number) => {
    const spot = (picX: number, picY: number): Point => [
      middle[0] + across[0] * picX + along[0] * picY,
      middle[1] + across[1] * picX + along[1] * picY,
      middle[2] + across[2] * picX + along[2] * picY,
    ];
    for (const [picX, picY] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ] as const)
      corner(spot(picX, picY), picX, picY, colour, picture);
  };
  const quads = () => corners.length / AIM_FLOATS / 6;
  for (const point of aim.zone) {
    if (quads() >= MOST_QUADS) break;
    quad([point[0], point[1], point[2] + RING_OVER_M], [aim.radius, 0, 0], [0, aim.radius, 0], tone.zone, PICTURE.ring);
  }
  const blended = corners.length / AIM_FLOATS;
  for (const point of aim.zone) {
    if (quads() >= MOST_QUADS) break;
    // Upright, its width turned across the eye's line on the flat.
    const [east, south] = [point[0] - camera.eye[0], point[1] - camera.eye[1]];
    const flat = Math.hypot(east, south) || 1;
    const across: Point = [(-south / flat) * POST.halfW, (east / flat) * POST.halfW, 0];
    quad([point[0], point[1], point[2] + POST.halfH], across, [0, 0, POST.halfH], tone.post, PICTURE.soft);
  }
  for (const point of aim.strikes) {
    if (quads() >= MOST_QUADS) break;
    // Stood a half mark out of its side toward the eye, so the hull it lies on never hides half of it.
    const toEye = minus(camera.eye, point);
    const out = STRIKE_HALF_M / (Math.hypot(...toEye) || 1);
    const middle: Point = [point[0] + toEye[0] * out, point[1] + toEye[1] * out, point[2] + toEye[2] * out];
    quad(middle, scaled(frame.right, STRIKE_HALF_M), scaled(frame.up, STRIKE_HALF_M), tone.strike, PICTURE.soft);
  }
  const march = time * ARC.dashSpeed;
  for (const arc of aim.arcs) {
    let flown = 0;
    for (let index = 1; index < arc.length; index++) {
      if (quads() >= MOST_QUADS) break;
      const [from, to] = [arc[index - 1], arc[index]];
      if (!from || !to) continue;
      const way = minus(to, from);
      const length = Math.hypot(...way);
      const middle = scaled([from[0] + to[0], from[1] + to[1], from[2] + to[2]], 0.5);
      const side = cross(way, minus(camera.eye, middle));
      const sideLength = Math.hypot(...side);
      if (length < 1e-6 || sideLength < 1e-9) continue;
      // Turned about its own length toward the eye, as wide on the screen at either end.
      const half = (point: Point) =>
        scaled(side, (ARC.widthVh * frame.viewHeight * Math.max(0, frame.depth(fromEye(point)))) / 2 / sideLength);
      const [nearHalf, farHalf] = [half(from), half(to)];
      const [startU, endU] = [(flown - march) / ARC.dashM, (flown + length - march) / ARC.dashM];
      const ends = [
        [minus(from, nearHalf), startU, -1],
        [[from[0] + nearHalf[0], from[1] + nearHalf[1], from[2] + nearHalf[2]], startU, 1],
        [[to[0] + farHalf[0], to[1] + farHalf[1], to[2] + farHalf[2]], endU, 1],
        [minus(to, farHalf), endU, -1],
      ] as const;
      for (const pick of [0, 1, 2, 0, 2, 3]) {
        const [point, picX, picY] = ends[pick] ?? ends[0];
        corner(point, picX, picY, tone.arc, PICTURE.line);
      }
      flown += length;
    }
  }
  const total = corners.length / AIM_FLOATS;
  return { corners: new Float32Array(corners), blended, added: total - blended };
}

const AIM_SHADER = /* wgsl */ `
struct Camera {
  from_eye: mat4x4f,
  eye: vec4f,
};
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var depths: texture_2d<f32>;

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) colour: vec4f,
  @location(2) @interpolate(flat) picture: u32,
};

@vertex
fn vertex_main(
  @location(0) place: vec3f,
  @location(1) uv: vec2f,
  @location(2) colour: vec4f,
  @location(3) picture: f32,
) -> Drawn {
  var drawn: Drawn;
  drawn.clip = camera.from_eye * vec4f(place - camera.eye.xyz, 1.0);
  drawn.uv = uv;
  drawn.colour = colour;
  drawn.picture = u32(picture + 0.5);
  return drawn;
}

@fragment
fn fragment_main(drawn: Drawn) -> @location(0) vec4f {
  // The depth is reversed: the scene stands nearer where its depth is greater.
  if (drawn.clip.z < textureLoad(depths, vec2i(drawn.clip.xy), 0).r) { discard; }
  var strength = 0.0;
  if (drawn.picture == 0u) {
    // The line: solid across its middle, dashed along its flight, the dash's second half dimmer.
    let across = 1.0 - smoothstep(0.55, 1.0, abs(drawn.uv.y));
    let dash = select(${ARC.dashDim}, 1.0, fract(drawn.uv.x) < 0.5);
    strength = across * dash;
  } else if (drawn.picture == 1u) {
    let reach = length(drawn.uv);
    strength = select(0.0, max(0.0, 1.0 - abs(reach - ${RING.peak}) / ${RING.half}), reach < 1.0);
  } else {
    let reach = length(drawn.uv);
    strength = pow(max(0.0, 1.0 - reach), 1.6);
  }
  let alpha = drawn.colour.a * strength;
  return vec4f(drawn.colour.rgb * alpha, alpha);
}
`;

/** Draws the aim over the finished picture. */
export class AimView {
  private readonly device: GPUDevice;
  private readonly layout: GPUBindGroupLayout;
  private readonly blended: GPURenderPipeline;
  private readonly added: GPURenderPipeline;
  private readonly corners: GPUBuffer;
  private readonly uniforms: GPUBuffer;
  private group: { readonly depth: GPUTexture; readonly group: GPUBindGroup } | null = null;

  constructor(gpu: Gpu) {
    this.device = gpu.device;
    const module = gpu.device.createShaderModule({ code: AIM_SHADER });
    this.layout = gpu.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const layout = gpu.device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    const pipeline = (source: GPUBlendFactor, destination: GPUBlendFactor) => {
      const blend = { srcFactor: source, dstFactor: destination, operation: 'add' } as const;
      return gpu.device.createRenderPipeline({
        layout,
        vertex: {
          module,
          entryPoint: 'vertex_main',
          buffers: [
            {
              arrayStride: AIM_FLOATS * 4,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'float32x2' },
                { shaderLocation: 2, offset: 20, format: 'float32x4' },
                { shaderLocation: 3, offset: 36, format: 'float32' },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: 'fragment_main',
          targets: [{ format: gpu.format, blend: { color: blend, alpha: blend } }],
        },
        primitive: { topology: 'triangle-list' },
      });
    };
    this.blended = pipeline('one', 'one-minus-src-alpha');
    this.added = pipeline('one', 'one');
    this.corners = gpu.device.createBuffer({
      size: MOST_QUADS * 6 * AIM_FLOATS * 4,
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    this.uniforms = gpu.device.createBuffer({
      size: 20 * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
  }

  /** Draws `aim` at `time` seconds from `camera` (window metres) over a finished single-sampled picture `target`,
   *  hidden where `depth` (the scene's depth, one float a pixel) stands nearer. */
  drawOver(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    depth: GPUTexture,
    aim: AimDrawn,
    camera: ShipCamera,
    time: number,
  ): void {
    const { corners, blended, added } = aimCorners(aim, camera, time);
    if (blended + added === 0) return;
    if (this.group?.depth !== depth) {
      const group = this.device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms } },
          { binding: 1, resource: depth.createView() },
        ],
      });
      this.group = { depth, group };
    }
    this.device.queue.writeBuffer(this.corners, 0, corners);
    const uniforms = new Float32Array(20);
    uniforms.set(camera.fromEye);
    uniforms.set([...camera.eye, 0], 16);
    this.device.queue.writeBuffer(this.uniforms, 0, uniforms);
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setVertexBuffer(0, this.corners);
    pass.setBindGroup(0, this.group.group);
    if (blended > 0) {
      pass.setPipeline(this.blended);
      pass.draw(blended);
    }
    if (added > 0) {
      pass.setPipeline(this.added);
      pass.draw(added, 1, blended);
    }
    pass.end();
  }
}
