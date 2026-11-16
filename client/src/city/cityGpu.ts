// The city's pipelines, made once a GPU and format: the models (and solids), the masses and the plates, all drawn
// into the scene's pass (4x MSAA, depth reversed) and sharing one bind group layout.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { shadowLayouts } from '../shadow.ts';
import { SAMPLES } from '../water/waterView.ts';
import { MASS_SHADER, MODEL_CAST_SHADER, MODEL_SHADER, PLATE_SHADER } from './cityShaders.ts';

/** WebGPU's buffer usages: the groundwork's, and the index and storage usages it does not name, by the
 *  specification's values. */
export const CITY_BUFFER_USAGE = { ...BUFFER_USAGE, index: 0x10, storage: 0x80 } as const;

export type CityPipelines = {
  readonly layout: GPUBindGroupLayout;
  readonly models: GPURenderPipeline;
  readonly masses: GPURenderPipeline;
  readonly plates: GPURenderPipeline;
  /** The models' and solids' depth along the sun, into the shadow map. */
  readonly modelsCast: GPURenderPipeline;
};

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
    ],
  });
  const shadows = shadowLayouts(device);
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout, shadows.receiver] });
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
    {
      arrayStride: 24,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 4, offset: 0, format: 'float32x4' },
        { shaderLocation: 5, offset: 16, format: 'uint32x2' },
      ],
    },
  ];
  const massModule = device.createShaderModule({ code: MASS_SHADER });
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
    masses: device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: massModule,
        entryPoint: 'mass_vertex',
        buffers: [
          {
            arrayStride: 48,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'uint32x4' },
            ],
          },
        ],
      },
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
    // Both faces cast, so a thin wall or a roof seen edge-on to the sun still throws its shadow.
    modelsCast: device.createRenderPipeline({
      layout: castLayout,
      vertex: { module: castModule, entryPoint: 'model_cast', buffers: modelBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    }),
  };
  byFormat.set(format, pipelines);
  return pipelines;
}
