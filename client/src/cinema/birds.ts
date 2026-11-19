// Gulls in flocks: each bird wheels round its flock's centre in a loose circle of its own, flapping a while and then
// gliding with its wings held, all of it worked out from a seed. Drawn into the scene's pass with depth, as a few
// flat triangles each, never smaller than a speck however far off.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { SAMPLES } from '../water/waterView.ts';
import { hashUnit } from './seeded.ts';

type Point = readonly [number, number, number];

/** One bird's way of flying, fixed by its flock's seed. */
export interface Bird {
  readonly orbitM: number;
  readonly speed: number;
  readonly phase: number;
  /** 1 round clockwise seen from above, -1 the other way. */
  readonly turn: number;
  readonly heightM: number;
  readonly seed: number;
  readonly flapHz: number;
}

/** Where a bird is and how it holds itself: its compass heading (0 north, a quarter turn east) and its wings, -1
 *  down to 1 up. */
export interface BirdPose {
  readonly position: Point;
  readonly heading: number;
  readonly wing: number;
}

/** Seconds a bird keeps to flapping or to gliding before it may change. */
const SPELL_S = 5;
/** The wings held a little up in a glide. */
const GLIDE_WING = 0.2;

/** `count` birds for a flock of `radiusM`, from `seed`. Most wheel the same way round, as a flock does. */
export function flockOf(count: number, radiusM: number, seed: number): Bird[] {
  return Array.from({ length: count }, (_slot, index) => {
    const lot = (salt: number) => hashUnit(seed * 1_000_003 + index * 97 + salt);
    return {
      orbitM: radiusM * (0.35 + 0.43 * lot(1)),
      speed: 9 + 3 * lot(2),
      phase: lot(3) * Math.PI * 2,
      turn: lot(4) < 0.8 ? 1 : -1,
      heightM: (lot(5) - 0.5) * radiusM * 0.3,
      seed: Math.floor(lot(6) * 1_000_000),
      flapHz: 2.6 + 0.6 * lot(7),
    };
  });
}

/** Where `bird` flies at `seconds` round a flock centred on `centre`. Its circle breathes in and out and its centre
 *  wanders, so no two rounds are the same, and it never strays past the flock's radius. */
export function birdAt(bird: Bird, centre: Point, seconds: number): BirdPose {
  const place = (time: number): Point => {
    const angle = bird.phase + (bird.turn * bird.speed * time) / bird.orbitM;
    const breathe = bird.orbitM * (1 + 0.12 * Math.sin(time * 0.31 + bird.seed));
    const wander = bird.orbitM * 0.12;
    return [
      centre[0] + Math.cos(angle) * breathe + Math.cos(time * 0.05 + bird.seed) * wander,
      centre[1] + Math.sin(angle) * breathe + Math.sin(time * 0.05 + bird.seed) * wander,
      centre[2] + bird.heightM + 2.5 * Math.sin(time * 0.4 + bird.seed * 0.7),
    ];
  };
  const position = place(seconds);
  const ahead = place(seconds + 0.005);
  const heading = Math.atan2(ahead[0] - position[0], -(ahead[1] - position[1]));
  const spell = Math.floor(seconds / SPELL_S + (bird.seed % 97) / 97);
  const into = seconds - (spell - (bird.seed % 97) / 97) * SPELL_S;
  const flapping = hashUnit(bird.seed + spell * 31) < 0.55;
  const weight = flapping ? Math.min(1, Math.max(0, Math.min(into, SPELL_S - into) / 0.4)) : 0;
  const stroke = Math.sin(seconds * bird.flapHz * Math.PI * 2 + bird.seed);
  return { position, heading, wing: weight === 0 ? GLIDE_WING : GLIDE_WING * (1 - weight) + stroke * weight };
}

// A gull's few triangles, in metres forward and to the right of its body, with how far each corner rises as the
// wings lift and how pale it is. The wingtips are dark, as a gull's are.
const BIRD_WGSL = /* wgsl */ `
struct View { from_eye: mat4x4f }
@group(0) @binding(0) var<uniform> view: View;
struct Out { @builtin(position) position: vec4f, @location(0) shade: f32 }

const CORNERS = array<vec4f, 18>(
  vec4f(0.32, 0.0, 0.0, 0.85), vec4f(0.0, -0.07, 0.0, 0.9), vec4f(-0.3, 0.0, 0.0, 0.8),
  vec4f(0.32, 0.0, 0.0, 0.85), vec4f(-0.3, 0.0, 0.0, 0.8), vec4f(0.0, 0.07, 0.0, 0.9),
  vec4f(0.08, 0.05, 0.0, 0.92), vec4f(-0.1, 0.05, 0.0, 0.92), vec4f(0.0, 0.36, 0.4, 0.88),
  vec4f(0.0, 0.36, 0.4, 0.88), vec4f(-0.1, 0.05, 0.0, 0.92), vec4f(-0.16, 0.68, 1.0, 0.18),
  vec4f(0.08, -0.05, 0.0, 0.92), vec4f(0.0, -0.36, 0.4, 0.88), vec4f(-0.1, -0.05, 0.0, 0.92),
  vec4f(0.0, -0.36, 0.4, 0.88), vec4f(-0.16, -0.68, 1.0, 0.18), vec4f(-0.1, -0.05, 0.0, 0.92),
);

@vertex fn bird_vertex(@builtin(vertex_index) index: u32, @location(0) place: vec4f, @location(1) wing: f32) -> Out {
  let corner = CORNERS[index];
  let forward = vec3f(sin(place.w), -cos(place.w), 0.0);
  let right = vec3f(cos(place.w), sin(place.w), 0.0);
  // Never smaller than about 4.5 milliradians across: a speck still shows a few hundred metres off.
  let scale = max(1.0, length(place.xyz) * 0.0045 / 1.36);
  let local = forward * corner.x + right * corner.y + vec3f(0.0, 0.0, corner.z * wing * 0.42);
  var out: Out;
  out.position = view.from_eye * vec4f(place.xyz + local * scale, 1.0);
  out.shade = corner.w;
  return out;
}

@fragment fn bird_fragment(in: Out) -> @location(0) vec4f {
  return vec4f(vec3f(in.shade) * vec3f(0.95, 0.96, 1.0), 1.0);
}
`;

/** Floats a bird takes in the instance buffer: where it is from the eye, its heading, its wings. */
const BIRD_FLOATS = 5;

/** Flocks of gulls, drawn as one of the scene's drawers. */
export class Birds {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private readonly group: GPUBindGroup;
  private flocks: { centre: Point; birds: Bird[] }[] = [];
  private instances: GPUBuffer | null = null;

  constructor(gpu: Gpu) {
    const { device } = gpu;
    this.device = device;
    const module = device.createShaderModule({ code: BIRD_WGSL });
    const layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: {
        module,
        entryPoint: 'bird_vertex',
        buffers: [
          {
            arrayStride: BIRD_FLOATS * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'bird_fragment', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: SAMPLES },
    });
    this.view = device.createBuffer({ size: 64, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.group = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.view } }] });
  }

  /** Adds a flock of `count` gulls wheeling within `radiusM` of `centre` (world metres), shaped by `seed`. */
  flock(centre: Point, count: number, radiusM: number, seed: number): void {
    this.flocks.push({ centre, birds: flockOf(count, radiusM, seed) });
  }

  /** Lets every flock go. */
  clear(): void {
    this.flocks = [];
  }

  /** The flocks at `time`, into the scene's pass, measured from the eye of `shot`. */
  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: { readonly eye: Point }, time: number): void {
    const count = this.flocks.reduce((sum, flock) => sum + flock.birds.length, 0);
    if (count === 0) return;
    const values = new Float32Array(count * BIRD_FLOATS);
    let written = 0;
    for (const { centre, birds } of this.flocks) {
      for (const bird of birds) {
        const pose = birdAt(bird, centre, time);
        values.set(
          [
            pose.position[0] - shot.eye[0],
            pose.position[1] - shot.eye[1],
            pose.position[2] - shot.eye[2],
            pose.heading,
            pose.wing,
          ],
          written,
        );
        written += BIRD_FLOATS;
      }
    }
    if (!this.instances || this.instances.size < values.byteLength) {
      this.instances?.destroy();
      this.instances = this.device.createBuffer({
        size: Math.max(1024, values.byteLength * 2),
        usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
      });
    }
    this.device.queue.writeBuffer(this.instances, 0, values);
    this.device.queue.writeBuffer(this.view, 0, fromEye.subarray(0, 16));
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.instances);
    pass.draw(18, count);
  }
}
