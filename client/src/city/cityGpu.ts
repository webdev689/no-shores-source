// The city's pipelines, made once a GPU and format: the models (and solids), the masses and the plates, all drawn
// into the scene's pass (4x MSAA, depth reversed) and sharing one bind group layout.
import { skyUniformFor } from '../sky/skyUniform.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import { shadowLayouts } from '../shadow.ts';
import { SAMPLES } from '../water/waterView.ts';
import {
  MASS_CAST_SHADER,
  MASS_SHADER,
  MODEL_CAST_SHADER,
  MODEL_CLEAR_CAST_SHADER,
  MODEL_SHADER,
  PLATE_SHADER,
} from './cityShaders.ts';

/** WebGPU's buffer usages: the groundwork's, and the index and storage usages it does not name, by the
 *  specification's values. */
export const CITY_BUFFER_USAGE = { ...BUFFER_USAGE, index: 0x10, storage: 0x80 } as const;

export type CityPipelines = {
  readonly layout: GPUBindGroupLayout;
  readonly models: GPURenderPipeline;
  /** The models and the masses as `models` and `masses` draw them, both faces: a ruin's broken buildings are open
   *  shells. */
  readonly brokenModels: GPURenderPipeline;
  readonly brokenMasses: GPURenderPipeline;
  readonly masses: GPURenderPipeline;
  readonly plates: GPURenderPipeline;
  /** The models' and solids' depth along the sun, into the shadow maps. */
  readonly modelsCast: GPURenderPipeline;
  /** An open building's shadow, through its windows' clear panes. */
  readonly modelsClearCast: GPURenderPipeline;
  /** The masses' and hulls' depth along the sun, into the far shadow map. */
  readonly massesCast: GPURenderPipeline;
};

/** Bytes a model instance: where it stands and its yaw, its cell and tier, the height it is broken off at, and how
 *  many times its size it is drawn. */
export const MODEL_INSTANCE_BYTES = 32;

/** The models' instance as the pipeline reads it: where it stands and its yaw, its cell and tier, its break, its
 *  size. */
export const MODEL_INSTANCE_LAYOUT = {
  arrayStride: MODEL_INSTANCE_BYTES,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 4, offset: 0, format: 'float32x4' },
    { shaderLocation: 5, offset: 16, format: 'uint32x2' },
    { shaderLocation: 6, offset: 24, format: 'float32' },
    { shaderLocation: 7, offset: 28, format: 'float32' },
  ],
} as const satisfies GPUVertexBufferLayout;

/** One instance standing at the origin, whole: what a view draws its solids, laid already in place, with. */
export const originInstance = (): ArrayBuffer => new ArrayBuffer(MODEL_INSTANCE_BYTES);

/** Bytes of the city's view uniform (`cityShaders.ts` View). */
export const CITY_VIEW_BYTES = 128;

const poolSamplers = new WeakMap<GPUDevice, GPUSampler>();

/** A light map for a city that is not lit: one dark texel. Its maker lets it go with the rest of its city. */
export function darkPoolMap(device: GPUDevice): GPUTexture {
  return device.createTexture({
    size: [1, 1],
    format: 'r8unorm',
    usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
  });
}

/** The light map's bindings (6 and 7): the map, read smoothly. */
export function poolBindings(device: GPUDevice, map: GPUTexture): GPUBindGroupEntry[] {
  const sampler = poolSamplers.get(device) ?? device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  poolSamplers.set(device, sampler);
  return [
    { binding: 6, resource: map.createView() },
    { binding: 7, resource: sampler },
  ];
}

const made = new WeakMap<GPUDevice, Map<GPUTextureFormat, CityPipelines>>();

export function cityPipelines(gpu: Gpu): CityPipelines {
  const { device, format } = gpu;
  const byFormat = made.get(device) ?? new Map<GPUTextureFormat, CityPipelines>();
  made.set(device, byFormat);
  const known = byFormat.get(format);
  if (known) return known;
  const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: both, buffer: { type: 'uniform' } },
      { binding: 1, visibility: both, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: both, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'float', viewDimension: '2d-array' } },
      { binding: 4, visibility: SHADER_STAGE.fragment, sampler: { type: 'filtering' } },
      { binding: 5, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'uint' } },
      // a lit city's light map of its lamps' pools, and its smooth sampler
      { binding: 6, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'float' } },
      { binding: 7, visibility: SHADER_STAGE.fragment, sampler: { type: 'filtering' } },
    ],
  });
  const shadows = shadowLayouts(device);
  const sky = skyUniformFor(device);
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [layout, shadows.receiver, sky.empty, sky.layout],
  });
  const castLayout = device.createPipelineLayout({ bindGroupLayouts: [layout, shadows.caster] });
  // every face is wound so its (b - a) x (c - a) points out; through this projection that reads clockwise
  const primitive: GPUPrimitiveState = { topology: 'triangle-list', cullMode: 'back', frontFace: 'cw' };
  const depthStencil: GPUDepthStencilState = {
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'greater',
  };
  const multisample = { count: SAMPLES };
  const targets = [{ format }];
  const modelModule = device.createShaderModule({ code: MODEL_SHADER });
  const castModule = device.createShaderModule({ code: MODEL_CAST_SHADER });
  const clearCastModule = device.createShaderModule({ code: MODEL_CLEAR_CAST_SHADER });
  const modelBuffers: GPUVertexBufferLayout[] = [
    {
      arrayStride: 36,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x2' },
        { shaderLocation: 3, offset: 32, format: 'uint32' },
      ],
    },
    MODEL_INSTANCE_LAYOUT,
  ];
  const massBuffers: GPUVertexBufferLayout[] = [
    {
      arrayStride: 48,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x4' },
        { shaderLocation: 1, offset: 16, format: 'float32x4' },
        { shaderLocation: 2, offset: 32, format: 'uint32x4' },
      ],
    },
  ];
  const massModule = device.createShaderModule({ code: MASS_SHADER });
  const massCastModule = device.createShaderModule({ code: MASS_CAST_SHADER });
  // Both faces cast, so a thin wall or a roof seen edge-on to the sun still throws its shadow.
  const castPrimitive: GPUPrimitiveState = { topology: 'triangle-list', cullMode: 'none' };
  const castDepth: GPUDepthStencilState = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' };
  const plateModule = device.createShaderModule({ code: PLATE_SHADER });
  const pipelines: CityPipelines = {
    layout,
    models: device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: modelModule, entryPoint: 'model_vertex', buffers: modelBuffers },
      fragment: { module: modelModule, entryPoint: 'surface_fragment', targets },
      primitive,
      depthStencil,
      multisample,
    }),
    brokenModels: device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: modelModule, entryPoint: 'model_vertex', buffers: modelBuffers },
      fragment: { module: modelModule, entryPoint: 'surface_fragment', targets },
      primitive: { ...primitive, cullMode: 'none' },
      depthStencil,
      multisample,
    }),
    brokenMasses: device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: massModule, entryPoint: 'mass_vertex', buffers: massBuffers },
      fragment: { module: massModule, entryPoint: 'surface_fragment', targets },
      primitive: { ...primitive, cullMode: 'none' },
      depthStencil,
      multisample,
    }),
    masses: device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: massModule, entryPoint: 'mass_vertex', buffers: massBuffers },
      fragment: { module: massModule, entryPoint: 'surface_fragment', targets },
      primitive,
      depthStencil,
      multisample,
    }),
    plates: device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: plateModule,
        entryPoint: 'plate_vertex',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      fragment: { module: plateModule, entryPoint: 'plate_fragment', targets },
      primitive,
      depthStencil,
      multisample,
    }),
    modelsCast: device.createRenderPipeline({
      layout: castLayout,
      vertex: { module: castModule, entryPoint: 'model_cast', buffers: modelBuffers },
      primitive: castPrimitive,
      depthStencil: castDepth,
    }),
    modelsClearCast: device.createRenderPipeline({
      layout: castLayout,
      vertex: { module: clearCastModule, entryPoint: 'model_clear_cast', buffers: modelBuffers },
      fragment: { module: clearCastModule, entryPoint: 'model_clear_cast_fragment', targets: [] },
      primitive: castPrimitive,
      depthStencil: castDepth,
    }),
    massesCast: device.createRenderPipeline({
      layout: castLayout,
      vertex: { module: massCastModule, entryPoint: 'mass_cast', buffers: massBuffers },
      primitive: castPrimitive,
      depthStencil: castDepth,
    }),
  };
  byFormat.set(format, pipelines);
  return pipelines;
}
