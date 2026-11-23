// The dungeon's two pipelines over one shader, drawn one after the other into the dungeon scene's pass (4x MSAA, depth
// reversed), each face wound as the city winds its solids: its depth laid first with no colour, then lit only where a
// face's depth is the one laid, so each covered sample is lit once however many faces lie behind it.
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { type Gpu, SHADER_STAGE } from '../gpu.ts';
import { SAMPLES } from '../water/waterView.ts';
import { DUNGEON_SHADER } from './dungeonShaders.ts';

/** The depth draw and the lit draw, and the layout of the one bind group both read. */
export type DungeonPipelines = {
  readonly depth: GPURenderPipeline;
  readonly lit: GPURenderPipeline;
  readonly layout: GPUBindGroupLayout;
};

/** The two draws' descriptions from one module and one layout. Both share the vertex stage, the faces kept and the
 *  samples, so both lay each face's depth alike. The depth draw writes depth and no colour; the lit draw writes no
 *  depth and passes at its own, reversed as `REVERSED_DEPTH` is, so a face nearer than the depth laid still shows. */
export function dungeonPipelineDescriptors(
  module: GPUShaderModule,
  layout: GPUPipelineLayout,
  format: GPUTextureFormat,
): { depth: GPURenderPipelineDescriptor; lit: GPURenderPipelineDescriptor } {
  const vertex: GPUVertexState = {
    module,
    entryPoint: 'dungeon_vertex',
    buffers: [
      {
        arrayStride: 36,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' },
          { shaderLocation: 3, offset: 32, format: 'uint32' },
        ],
      },
    ],
  };
  const primitive: GPUPrimitiveState = { topology: 'triangle-list', cullMode: 'back', frontFace: 'cw' };
  const multisample: GPUMultisampleState = { count: SAMPLES };
  const depthFormat = REVERSED_DEPTH.format;
  return {
    depth: {
      layout,
      vertex,
      primitive,
      multisample,
      fragment: { module, entryPoint: 'dungeon_depth', targets: [{ format, writeMask: 0 }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: REVERSED_DEPTH.compare },
    },
    lit: {
      layout,
      vertex,
      primitive,
      multisample,
      fragment: { module, entryPoint: 'dungeon_fragment', targets: [{ format }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: 'greater-equal' },
    },
  };
}

const made = new WeakMap<GPUDevice, Map<GPUTextureFormat, DungeonPipelines>>();

/** The dungeon's pipelines, made once a GPU and format. */
export function dungeonPipelines(gpu: Gpu): DungeonPipelines {
  const byFormat = made.get(gpu.device) ?? new Map<GPUTextureFormat, DungeonPipelines>();
  made.set(gpu.device, byFormat);
  const known = byFormat.get(gpu.format);
  if (known) return known;
  const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
  const layout = gpu.device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: both, buffer: { type: 'uniform' } },
      { binding: 1, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'float', viewDimension: '2d-array' } },
      { binding: 3, visibility: SHADER_STAGE.fragment, sampler: { type: 'filtering' } },
      { binding: 4, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
    ],
  });
  const module = gpu.device.createShaderModule({ code: DUNGEON_SHADER });
  const pipelineLayout = gpu.device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const { depth, lit } = dungeonPipelineDescriptors(module, pipelineLayout, gpu.format);
  const pipelines = {
    depth: gpu.device.createRenderPipeline(depth),
    lit: gpu.device.createRenderPipeline(lit),
    layout,
  };
  byFormat.set(gpu.format, pipelines);
  return pipelines;
}
