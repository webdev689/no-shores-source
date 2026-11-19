import { FightBlood, surfacesOf } from '../combat/fightBlood.ts';
import { Hud } from '../combat/hud.ts';
import { MARK_FLOATS } from '../combat/marks.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import { SAMPLES } from '../water/waterView.ts';
import { fromEyeMatrix, shifted } from './camera.ts';
import type { Foot, FootFrame } from './foot.ts';
import type { Drawer } from './scene.ts';

type Point = readonly [number, number, number];

/** The land is drawn a little off the ground bodies stand on, so what lies on it (the marks of telegraphed blows, the
 *  blood) is drawn this much higher, in metres, or the drawn land would hide it. */
const OVER_THE_LAND_M = 0.12;

/** The fight's marks, measured from the eye: blended over what is drawn, tested against its depth, writing none. */
const MARK_SHADER = /* wgsl */ `
struct View { from_eye: mat4x4f }
@group(0) @binding(0) var<uniform> view: View;
struct Out { @builtin(position) position: vec4f, @location(0) colour: vec4f }

@vertex fn mark_vertex(@location(0) position: vec3f, @location(1) colour: vec4f) -> Out {
  var out: Out;
  out.position = view.from_eye * vec4f(position, 1.0);
  out.colour = colour;
  return out;
}

// An opacity below none marks light added to what stands behind (a drop's line): its colour, covering nothing.
@fragment fn mark_fragment(in: Out) -> @location(0) vec4f {
  if (in.colour.a < 0.0) { return vec4f(in.colour.rgb, 0.0); }
  return vec4f(in.colour.rgb * in.colour.a, in.colour.a);
}
`;

/** The fight's marks drawn with the land, from vertices measured from the eye as `marksMesh` lays them. */
class FightMarks {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private readonly group: GPUBindGroup;
  private buffer: GPUBuffer | null = null;
  private count = 0;

  constructor(gpu: Gpu) {
    this.device = gpu.device;
    const module = gpu.device.createShaderModule({ code: MARK_SHADER });
    const blend = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'mark_vertex',
        buffers: [
          {
            arrayStride: MARK_FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'mark_fragment',
        targets: [{ format: gpu.format, blend: { color: blend, alpha: blend } }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: false, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    this.view = gpu.device.createBuffer({ size: 64, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.group = gpu.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.view } }],
    });
  }

  /** The marks the next frame draws. */
  set(vertices: Float32Array): void {
    this.count = vertices.length / MARK_FLOATS;
    if (this.count === 0) return;
    if (!this.buffer || this.buffer.size < vertices.byteLength) {
      this.buffer?.destroy();
      const size = Math.max(4096, 2 ** Math.ceil(Math.log2(vertices.byteLength)));
      this.buffer = this.device.createBuffer({ size, usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination });
    }
    this.device.queue.writeBuffer(this.buffer, 0, vertices);
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array): void {
    if (!this.buffer || this.count === 0) return;
    this.device.queue.writeBuffer(this.view, 0, fromEye);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.count);
  }
}

/**
 * The fight on foot as the game shows it: its blood on the node's land and boxes, its marks on the ground and in the
 * air, and its display over the view, under the game's own (its place, its hints, its menus and its veil).
 */
export class FootView {
  private readonly gpu: Gpu;
  private readonly marks: FightMarks;
  private readonly root: HTMLElement;
  private readonly hud: Hud;
  private blood: { readonly foot: Foot; readonly drawn: FightBlood; readonly origin: Point } | null = null;

  constructor(gpu: Gpu, hudRoot: HTMLElement) {
    this.gpu = gpu;
    this.marks = new FightMarks(gpu);
    this.root = document.createElement('div');
    this.root.className = 'fight';
    this.root.hidden = true;
    hudRoot.prepend(this.root);
    this.hud = new Hud(this.root);
  }

  /** The node's blood, kept from its first spawn so its marks keep their centimetres; made again in a new node. */
  private bloodOf(foot: Foot, groundAt: (x: number, y: number) => number | null) {
    if (this.blood?.foot === foot) return this.blood;
    this.blood?.drawn.destroy();
    const [x, y] = foot.node.spawns[0] ?? foot.node.centre;
    const origin: Point = [x, y, 0];
    const surfaces = surfacesOf(foot.boxes, (east, south) => groundAt(east, south) ?? 0);
    this.blood = { foot, drawn: new FightBlood(this.gpu, surfaces, location.search, origin, SAMPLES), origin };
    return this.blood;
  }

  /**
   * One frame of the fight on foot: its blood run on by `seconds`, its marks taken, and its display shown over a canvas
   * `viewport` CSS pixels big, drawn `size` device pixels. Answers the drawers that lie under the figures (the blood)
   * and over them (the marks).
   */
  frame(
    foot: Foot,
    shown: FootFrame,
    seconds: number,
    {
      size,
      viewport,
      groundAt,
    }: {
      size: { readonly width: number; readonly height: number };
      viewport: { readonly width: number; readonly height: number };
      groundAt: (x: number, y: number) => number | null;
    },
  ): { under: Drawer; over: Drawer } {
    this.root.hidden = false;
    const { shot, fight } = shown;
    const fromEye = fromEyeMatrix(shot, size.width / Math.max(1, size.height));
    const [eyeX, eyeY, eyeZ] = shot.eye;
    const blood = this.bloodOf(foot, groundAt);
    const [originX, originY, originZ] = blood.origin;
    const local: Point = [eyeX - originX, eyeY - originY, eyeZ - originZ];
    blood.drawn.frame(seconds, fight.events, foot.fight, {
      viewProjection: shifted(fromEye, [-local[0], -local[1], OVER_THE_LAND_M - local[2]]),
      focus: local,
      eye: local,
      right: [Math.cos(shot.yaw), Math.sin(shot.yaw), 0],
    });
    this.marks.set(shown.marks);
    const matrix = shifted(fromEye, [-eyeX, -eyeY, -eyeZ]);
    this.hud.update(
      { ...fight, matrix, width: viewport.width, height: viewport.height, lost: null, rejoining: foot.rejoining },
      seconds,
    );
    const drawn = blood.drawn;
    return {
      under: { drawInto: (pass) => drawn.draw(pass) },
      over: { drawInto: (pass, eyeMatrix) => this.marks.drawInto(pass, shifted(eyeMatrix, [0, 0, OVER_THE_LAND_M])) },
    };
  }

  /** Hides the fight's display off foot, and lets go of the last node's blood. */
  hide(): void {
    this.root.hidden = true;
    this.blood?.drawn.destroy();
    this.blood = null;
  }
}
