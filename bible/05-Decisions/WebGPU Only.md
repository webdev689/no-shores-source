---
type: decision
date: 2026-11-14
status: in force
---
# WebGPU Only

> "Can we do WebGPU?"

> "Yes, strictly webgpu"

## What it settles

- The client draws with WebGPU and nothing else: no WebGL, no fallback.
- DFO Online's WebGL2 renderer is the specification for what our renderer draws; its GPU code and shaders are
  rewritten for WebGPU and WGSL. The code above the GPU calls comes over as TypeScript.
- A browser without WebGPU gets a plain message saying so (`client/src/gpu.ts`).
- The layers check refuses any WebGL in client code ([[Checks]]).
