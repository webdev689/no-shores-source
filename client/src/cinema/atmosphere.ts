// The weather drawn over the finished picture in one full-screen draw, after the water and the light layer and before
// the first person's hands. The game's sun is fixed in every shader, so a storm dims it here, once, rather than in each.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { ATMOSPHERE_WGSL } from './atmosphereShader.ts';
import type { Weather } from './weather.ts';

type Vector = readonly [number, number, number];

/** The numbers the pass reads a frame, as `atmosphereValues` packs them: eleven rows of four. */
export const ATMOSPHERE_FLOATS = 44;
/** The brightest flash shown to a player who asks for reduced motion. */
const STILL_FLASH = 1 / 3;

/** A frame of weather and the camera it is seen from, its eye in world metres. The depth law (scale and offset) is
 *  the camera's own, reading the scene's reversed depth back into metres ahead. */
export interface AtmosphereFrame {
  readonly weather: Weather;
  readonly camera: {
    readonly eye: Vector;
    readonly forward: Vector;
    readonly right: Vector;
    readonly up: Vector;
    readonly depthScale: number;
    readonly depthOffset: number;
  };
  readonly tanHalfView: number;
  readonly size: readonly [number, number];
  /** Seconds, for the rain's fall and the clouds' drift. */
  readonly time: number;
  /** The player asked for reduced motion: no flash brighter than a third. */
  readonly motionReduced: boolean;
  /** The light on the cloud flown through, as the sky lights its own at the hour: the day's white when not given. */
  readonly light?: Vector;
}

/** True when the weather adds nothing to the picture, so the pass is skipped and the picture is exactly as drawn. */
export function drawsNothing(weather: Weather): boolean {
  const { overcast, rain, snow, mist, flash, deep, clouds, glow, bolt } = weather;
  return overcast + rain + snow + mist + flash + deep === 0 && !clouds && !glow && !bolt;
}

/** The frame packed for the shader's `Frame`, row by row. The bolt rides as metres from the eye, so a world tens of
 *  kilometres across keeps it in place on a GPU's single floats. */
export function atmosphereValues(frame: AtmosphereFrame): Float32Array {
  const { weather, camera } = frame;
  const flash = frame.motionReduced ? Math.min(weather.flash, STILL_FLASH) : weather.flash;
  const glow = weather.glow;
  const clouds = weather.clouds;
  const bolt = weather.bolt;
  return Float32Array.from([
    ...camera.eye,
    frame.time,
    ...camera.forward,
    camera.depthScale,
    ...camera.right,
    camera.depthOffset,
    ...camera.up,
    frame.tanHalfView,
    frame.size[0],
    frame.size[1],
    flash,
    weather.deep,
    weather.overcast,
    weather.rain,
    weather.snow,
    weather.mist,
    weather.wind[0],
    weather.wind[1],
    0,
    0,
    ...(glow ? [...glow.colour, glow.strength] : [0, 0, 0, 0]),
    ...(clouds ? [clouds.base, clouds.top, clouds.cover, 0] : [0, 0, 0, 0]),
    ...(bolt ? [bolt.x - camera.eye[0], bolt.y - camera.eye[1], bolt.seed, 1] : [0, 0, 0, 0]),
    ...(frame.light ?? [1, 1, 1]),
    0,
  ]);
}

/** The weather pass. Its bind group is made again only when the scene's depth texture is. */
export class Atmosphere {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly layout: GPUBindGroupLayout;
  private readonly values: GPUBuffer;
  private bound: { depth: GPUTexture; group: GPUBindGroup } | null = null;

  constructor(gpu: Gpu) {
    const { device } = gpu;
    this.device = device;
    const module = device.createShaderModule({ code: ATMOSPHERE_WGSL });
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    // Keeps the picture by the pass's alpha and adds its colour: the weather both dims and lights in one draw.
    const blend: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'src-alpha', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: { module, entryPoint: 'whole' },
      fragment: { module, entryPoint: 'atmosphere', targets: [{ format: gpu.format, blend }] },
    });
    this.values = device.createBuffer({
      size: ATMOSPHERE_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
  }

  /** Lays the frame's weather over `target`, reading `depth` (the scene's, one float a pixel, reversed). A weather
   *  that adds nothing encodes nothing. */
  encode(encoder: GPUCommandEncoder, target: GPUTextureView, depth: GPUTexture, frame: AtmosphereFrame): void {
    if (drawsNothing(frame.weather)) return;
    this.device.queue.writeBuffer(this.values, 0, atmosphereValues(frame));
    if (this.bound?.depth !== depth) {
      const group = this.device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: this.values } },
          { binding: 1, resource: depth.createView() },
        ],
      });
      this.bound = { depth, group };
    }
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bound.group);
    pass.draw(3);
    pass.end();
  }
}
