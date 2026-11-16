import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';

/** The ripple field's cells a side and their size, metres: 32 m square round the body that stirs it. */
export const RIPPLE_CELLS = 256;
export const RIPPLE_CELL_M = 0.125;
/** Steps a second, how far a wave moves a step (squared, in cells: under a half keeps it stable; this makes ripples
 *  run about 1.3 m/s, as real ones do) and how much each keeps a step (half gone in about a second and a half). */
const STEPS_A_SECOND = 60;
const COURANT = 0.03;
const DAMPING = 0.992;
const MOST_STEPS = 4;
const MOST_STIRS = 8;
/** The field follows its body once it strays this many cells from the middle. */
const FOLLOW_CELLS = 48;
/** One step's uniforms, padded to WebGPU's offset alignment so one buffer holds a frame's steps. */
const STEP_BYTES = 256;

/**
 * Each cell's height moves toward its neighbours' (the wave equation), loses a little each step and fades at the
 * field's edge so a ripple leaves rather than bounces. A stir presses a smooth dip into the water. When the field
 * moves to follow its body, each cell reads from where its water was: 'shift.xy' for the last step's heights,
 * 'shift.zw' for the step before, which may still lie where the field was a step earlier.
 */
const SHADER = /* wgsl */ `
struct Step {
  shift: vec4i,
  count: vec4u,
  stirs: array<vec4f, ${MOST_STIRS}>,
};

@group(0) @binding(0) var<uniform> step: Step;
@group(0) @binding(1) var older: texture_2d<f32>;
@group(0) @binding(2) var current: texture_2d<f32>;
@group(0) @binding(3) var next: texture_storage_2d<r32float, write>;

const SIZE = ${RIPPLE_CELLS};

fn at(field: texture_2d<f32>, cell: vec2i) -> f32 {
  if (any(cell < vec2i(0)) || any(cell >= vec2i(SIZE))) { return 0.0; }
  return textureLoad(field, cell, 0).r;
}

@compute @workgroup_size(8, 8)
fn advance(@builtin(global_invocation_id) id: vec3u) {
  let cell = vec2i(id.xy);
  let source_cell = cell + step.shift.xy;
  let here = at(current, source_cell);
  let around = at(current, source_cell + vec2i(1, 0)) + at(current, source_cell - vec2i(1, 0)) + at(current, source_cell + vec2i(0, 1)) + at(current, source_cell - vec2i(0, 1));
  var height = (2.0 * here - at(older, cell + step.shift.zw) + ${COURANT} * (around - 4.0 * here)) * ${DAMPING};
  for (var index = 0u; index < step.count.x; index++) {
    let stir = step.stirs[index];
    let reach_to = distance(vec2f(cell) + 0.5, stir.xy) / stir.z;
    height += stir.w * exp(-reach_to * reach_to);
  }
  let edge = min(min(cell.x, cell.y), min(SIZE - 1 - cell.x, SIZE - 1 - cell.y));
  textureStore(next, cell, vec4f(height * smoothstep(0.0, 24.0, f32(edge)), 0.0, 0.0, 0.0));
}
`;

/** Ripples on the water round a body: a damped wave field stepped on the GPU at a fixed rate, stirred where the
 *  body moves through the water. Its three textures take turns as the step before last, the last and the next. */
export class RippleField {
  private readonly device: GPUDevice;
  private readonly textures: readonly GPUTexture[];
  private readonly uniforms: GPUBuffer;
  private readonly pipeline: GPUComputePipeline;
  private readonly bindGroups: readonly GPUBindGroup[];
  private newest = 1;
  private origin: [number, number] | null = null;
  private stirs: [number, number, number, number][] = [];
  private owed = 0;
  /** How far the step before last lies from the last, cells: the shift its heights still need. */
  private lag: [number, number] = [0, 0];

  constructor(device: GPUDevice) {
    this.device = device;
    this.textures = [0, 1, 2].map(() =>
      device.createTexture({
        size: [RIPPLE_CELLS, RIPPLE_CELLS],
        format: 'r32float',
        usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.storageBinding,
      }),
    );
    this.uniforms = device.createBuffer({
      size: STEP_BYTES * MOST_STEPS,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    const layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: SHADER_STAGE.compute,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: STEP_BYTES },
        },
        { binding: 1, visibility: SHADER_STAGE.compute, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: SHADER_STAGE.compute, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: SHADER_STAGE.compute, storageTexture: { access: 'write-only', format: 'r32float' } },
      ],
    });
    this.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: device.createShaderModule({ code: SHADER }), entryPoint: 'advance' },
    });
    // Turn n writes texture n from the two before it.
    this.bindGroups = [0, 1, 2].map((turn) =>
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms, size: STEP_BYTES } },
          { binding: 1, resource: this.texture((turn + 1) % 3).createView() },
          { binding: 2, resource: this.texture((turn + 2) % 3).createView() },
          { binding: 3, resource: this.texture(turn).createView() },
        ],
      }),
    );
  }

  private texture(index: number): GPUTexture {
    const texture = this.textures[index];
    if (!texture) throw new Error(`no ripple texture ${index}`);
    return texture;
  }

  /** The field's latest heights, metres. */
  get heights(): GPUTexture {
    return this.texture(this.newest);
  }

  /** Where the field lies: the window corner of its cell (0, 0), metres, its cell size and its cells a side. */
  get area(): readonly [number, number, number, number] {
    const [column, row] = this.origin ?? [0, 0];
    return [column * RIPPLE_CELL_M, row * RIPPLE_CELL_M, RIPPLE_CELL_M, RIPPLE_CELLS];
  }

  /** Presses the water at a window point down by `strength` metres over `radiusM`, at the next step. */
  stir(x: number, y: number, radiusM: number, strength: number): void {
    if (this.stirs.length < MOST_STIRS) this.stirs.push([x, y, radiusM, strength]);
  }

  /** Steps the field for the `seconds` since the last frame, following a body at (x, y), window metres. */
  advance(encoder: GPUCommandEncoder, x: number, y: number, seconds: number): void {
    const wanted: [number, number] = [
      Math.round(x / RIPPLE_CELL_M) - RIPPLE_CELLS / 2,
      Math.round(y / RIPPLE_CELL_M) - RIPPLE_CELLS / 2,
    ];
    this.owed = Math.min(this.owed + seconds * STEPS_A_SECOND, MOST_STEPS);
    const steps = Math.floor(this.owed);
    // The field moves, and its stirs land, only with a step: a frame between steps leaves it as it was.
    if (steps === 0) return;
    this.owed -= steps;
    const origin = this.origin ?? wanted;
    const far = Math.max(Math.abs(wanted[0] - origin[0]), Math.abs(wanted[1] - origin[1]));
    // Once the body strays FOLLOW_CELLS from the middle the field moves under it, each cell reading where its water
    // was; cells new to the field start still.
    let shift: [number, number] = far > FOLLOW_CELLS ? [wanted[0] - origin[0], wanted[1] - origin[1]] : [0, 0];
    this.origin = far > FOLLOW_CELLS ? wanted : origin;
    const values = new ArrayBuffer(STEP_BYTES * MOST_STEPS);
    for (let index = 0; index < steps; index++) {
      const stirs = index === 0 ? this.stirs : [];
      const offset = index * STEP_BYTES;
      new Int32Array(values, offset, 4).set([...shift, shift[0] + this.lag[0], shift[1] + this.lag[1]]);
      new Uint32Array(values, offset + 16, 1).set([stirs.length]);
      const floats = new Float32Array(values, offset + 32, MOST_STIRS * 4);
      for (const [slot, [stirX, stirY, radius, strength]] of stirs.entries()) {
        const cell = [stirX / RIPPLE_CELL_M - this.origin[0], stirY / RIPPLE_CELL_M - this.origin[1]];
        floats.set([cell[0] ?? 0, cell[1] ?? 0, Math.max(1, radius / RIPPLE_CELL_M), strength], slot * 4);
      }
      this.lag = shift;
      shift = [0, 0];
    }
    this.stirs = [];
    this.device.queue.writeBuffer(this.uniforms, 0, values);
    for (let index = 0; index < steps; index++) {
      const turn = (this.newest + 1) % 3;
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroups[turn] ?? null, [index * STEP_BYTES]);
      pass.dispatchWorkgroups(RIPPLE_CELLS / 8, RIPPLE_CELLS / 8);
      pass.end();
      this.newest = turn;
    }
  }

  destroy(): void {
    for (const texture of this.textures) texture.destroy();
    this.uniforms.destroy();
  }
}
