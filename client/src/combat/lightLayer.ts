// The stepped light layer: what burns brightest in a fight (white-hot stars and arcs, muzzle flashes, spells) lights
// what stands round it, in the game's pixel look. The emitters are drawn again into a target a quarter of the picture
// each way, tested against the scene's depth, each giving light only from its light and white-hot stops. The light is
// box-blurred twice, cut to three levels a channel and added over the finished picture in blocks of four screen
// pixels, never more than the cap. No soft falloff survives the cut: the halo steps like the figures do.
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';

type Rgb = readonly [number, number, number];

/** The layer's numbers: screen pixels to a light pixel each way; the brightness (luma) a colour must pass to give
 *  light; the blurred light's gain before its cut, which sets how far a halo reaches; the most light added a channel;
 *  and how far an emitter may stand behind the scene's depth and still give light, as a share of its distance. */
export const LIGHT = { scale: 4, from: 0.7, gain: 3, cap: 0.35, behind: 0.03 } as const;

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];
const ADD = { srcFactor: 'one', dstFactor: 'one', operation: 'add' } as const;
const FORMAT = 'rgba8unorm';

/** The light `colour` gives at `share` of its strength: none at or below LIGHT.from's brightness, all of it at white. */
export function lightOf(colour: Rgb, share = 1): Rgb {
  const luma = colour[0] * LUMA[0] + colour[1] * LUMA[1] + colour[2] * LUMA[2];
  const over = Math.min(1, Math.max(0, (luma - LIGHT.from) / (1 - LIGHT.from))) * share;
  return [colour[0] * over, colour[1] * over, colour[2] * over];
}

/** A channel of blurred light cut to its level: none, half the cap or the whole of it, a third of the range each. */
export const lightLevel = (value: number): number =>
  Math.floor(Math.min(1, Math.max(0, value * LIGHT.gain)) * 2.999) / 2;

/** The light target's size for a picture `width` by `height` pixels. */
export const lightSize = (width: number, height: number): [number, number] => [
  Math.ceil(width / LIGHT.scale),
  Math.ceil(height / LIGHT.scale),
];

/** The colour target an emitter's light pipeline draws to, each adding its light. */
export const LIGHT_TARGET: GPUColorTargetState = { format: FORMAT, blend: { color: ADD, alpha: ADD } };
/** And its depth: the scene's at the light's size, tested and never written. */
export const LIGHT_DEPTH: GPUDepthStencilState = {
  format: REVERSED_DEPTH.format,
  depthWriteEnabled: false,
  depthCompare: 'greater-equal',
};

/** An emitter's light in WGSL, as `lightOf` gives it. */
export const LIGHT_WGSL = /* wgsl */ `
fn light_of(colour: vec3f, share: f32) -> vec4f {
  let luma = dot(colour, vec3f(${LUMA.join(', ')}));
  let over = clamp((luma - ${LIGHT.from.toFixed(3)}) / ${(1 - LIGHT.from).toFixed(3)}, 0.0, 1.0) * share;
  return vec4f(colour * over, 0.0);
}
`;

const WHOLE = /* wgsl */ `
@vertex fn whole(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** The scene's depth at the light's size, a point in each block, pushed back by LIGHT.behind (nearer is more). */
const primeWgsl = (depth: 'depth' | 'float') => /* wgsl */ `
@group(0) @binding(0) var depths: ${depth === 'depth' ? 'texture_depth_2d' : 'texture_2d<f32>'};
${WHOLE}
struct Primed { @location(0) light: vec4f, @builtin(frag_depth) depth: f32 }
@fragment fn prime(@builtin(position) position: vec4f) -> Primed {
  let most = vec2i(textureDimensions(depths)) - 1;
  let at = min(vec2i(position.xy) * ${LIGHT.scale} + ${LIGHT.scale / 2}, most);
  return Primed(vec4f(0.0), textureLoad(depths, at, 0)${depth === 'depth' ? '' : '.r'} / ${(1 + LIGHT.behind).toFixed(3)});
}
`;

const PASSES = /* wgsl */ `
@group(0) @binding(0) var light: texture_2d<f32>;
${WHOLE}
@fragment fn blur(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let most = vec2i(textureDimensions(light)) - 1;
  var sum = vec4f(0.0);
  for (var down = -1; down <= 1; down++) {
    for (var across = -1; across <= 1; across++) {
      sum += textureLoad(light, clamp(vec2i(position.xy) + vec2i(across, down), vec2i(0), most), 0);
    }
  }
  return sum / 9.0;
}
@fragment fn lay(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let at = min(vec2i(position.xy) / ${LIGHT.scale}, vec2i(textureDimensions(light)) - 1);
  let level = floor(clamp(textureLoad(light, at, 0).rgb * ${LIGHT.gain.toFixed(3)}, vec3f(0.0), vec3f(1.0)) * 2.999) / 2.0;
  if (all(level == vec3f(0.0))) { discard; }
  return vec4f(level * ${LIGHT.cap.toFixed(3)}, 0.0);
}
`;

/** The light's targets at one picture size: two to blur between and a depth, each with what reads it. */
interface Targets {
  readonly width: number;
  readonly height: number;
  readonly textures: readonly GPUTexture[];
  readonly first: GPUTextureView;
  readonly second: GPUTextureView;
  readonly depth: GPUTextureView;
  readonly fromFirst: GPUBindGroup;
  readonly fromSecond: GPUBindGroup;
  readonly laid: GPUBindGroup;
}

/**
 * The light layer for a scene whose depth is a depth texture (`depth`) or one float a pixel (`float`). Its targets are
 * made again only when the picture's size changes, its bind groups with them, so a frame makes nothing new.
 */
export class LightLayer {
  private readonly device: GPUDevice;
  private readonly prime: GPURenderPipeline;
  private readonly blur: GPURenderPipeline;
  private readonly lay: GPURenderPipeline;
  private targets: Targets | null = null;
  private primed: { scene: GPUTexture; group: GPUBindGroup } | null = null;

  constructor(gpu: Gpu, depth: 'depth' | 'float') {
    const { device } = gpu;
    this.device = device;
    const primeModule = device.createShaderModule({ code: primeWgsl(depth) });
    const sampleType = depth === 'depth' ? 'depth' : 'unfilterable-float';
    const primeLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.fragment, texture: { sampleType } }],
    });
    this.prime = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [primeLayout] }),
      vertex: { module: primeModule, entryPoint: 'whole' },
      fragment: { module: primeModule, entryPoint: 'prime', targets: [{ format: FORMAT }] },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: true, depthCompare: 'always' },
    });
    const module = device.createShaderModule({ code: PASSES });
    const whole = (entryPoint: string, target: GPUColorTargetState) =>
      device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'whole' },
        fragment: { module, entryPoint, targets: [target] },
      });
    this.blur = whole('blur', { format: FORMAT });
    // The light adds to the picture's colour and leaves its alpha.
    const keep = { srcFactor: 'zero', dstFactor: 'one', operation: 'add' } as const;
    this.lay = whole('lay', { format: gpu.format, blend: { color: ADD, alpha: keep } });
  }

  /** Lights the finished picture `target`, its scene's depth `depth` (the picture's size): `draw` draws the emitters'
   *  light into a pass at the light's size, with its own depth and the viewport set to the picture's quarter. */
  encode(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    depth: GPUTexture,
    draw: (pass: GPURenderPassEncoder) => void,
  ): void {
    const targets = this.targetsFor(depth.width, depth.height);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: targets.first, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      depthStencilAttachment: {
        view: targets.depth,
        depthClearValue: REVERSED_DEPTH.clearValue,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    pass.setPipeline(this.prime);
    pass.setBindGroup(0, this.primedFrom(depth));
    pass.draw(3);
    pass.setViewport(0, 0, depth.width / LIGHT.scale, depth.height / LIGHT.scale, 0, 1);
    draw(pass);
    pass.end();
    this.whole(encoder, targets.second, this.blur, targets.fromFirst, 'clear');
    this.whole(encoder, targets.first, this.blur, targets.fromSecond, 'clear');
    this.whole(encoder, target, this.lay, targets.laid, 'load');
  }

  /** One pass over the whole of `view` with `pipeline` reading `group`. */
  private whole(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    pipeline: GPURenderPipeline,
    group: GPUBindGroup,
    loadOp: GPULoadOp,
  ): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp, storeOp: 'store', clearValue: [0, 0, 0, 0] }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  }

  /** The targets for a picture `width` by `height`, made again when its size changes. */
  private targetsFor(width: number, height: number): Targets {
    if (this.targets?.width === width && this.targets.height === height) return this.targets;
    for (const texture of this.targets?.textures ?? []) texture.destroy();
    const { device } = this;
    const size = lightSize(width, height);
    const usage = TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding;
    const first = device.createTexture({ size, format: FORMAT, usage });
    const second = device.createTexture({ size, format: FORMAT, usage });
    const depth = device.createTexture({ size, format: REVERSED_DEPTH.format, usage: TEXTURE_USAGE.renderAttachment });
    const reading = (pipeline: GPURenderPipeline, texture: GPUTexture) =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: texture.createView() }],
      });
    this.targets = {
      width,
      height,
      textures: [first, second, depth],
      first: first.createView(),
      second: second.createView(),
      depth: depth.createView(),
      fromFirst: reading(this.blur, first),
      fromSecond: reading(this.blur, second),
      laid: reading(this.lay, first),
    };
    return this.targets;
  }

  /** The prime's bind group reading the scene's depth `scene`, made again when it is another texture. */
  private primedFrom(scene: GPUTexture): GPUBindGroup {
    if (this.primed?.scene !== scene) {
      const group = this.device.createBindGroup({
        layout: this.prime.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: scene.createView() }],
      });
      this.primed = { scene, group };
    }
    return this.primed.group;
  }

  destroy(): void {
    for (const texture of this.targets?.textures ?? []) texture.destroy();
    this.targets = null;
    this.primed = null;
  }
}
