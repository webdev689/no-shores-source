---
type: index
---
# Open Questions

Decisions waiting on the owner. Each says what it decides and what Claude recommends, if anything; none is in force
until the owner decides it and it moves to [[Decisions]].

| Question | Why it matters | Recommendation |
|---|---|---|
| Engine base: hand-rolled on `wgpu` and `winit`, or an engine framework such as Bevy? | Sets how every crate draws, reads input and is structured | Hand-rolled on `wgpu` (graphics on WebGPU, WebGL2, Vulkan, Metal and DirectX) and `winit` (windows and input): our own engine, as DFO's renderer was, with no framework releases to chase |
| Which platforms ship first: browser, desktop, or both? | Shapes the first build targets and testing | Both build from one codebase; which ships first is the owner's call |
| Where the servers run, and which database | Hosting, cost and how persistence is built | Decide when the first server crate is written |
| Network transport | Latency and browser support | WebSocket first; WebTransport later where browsers support it |
| Where generated files live (forge renders, world bakes) | [[Generated Files Stay Out of Git]] needs a home | An object store addressed by content hash, decided with the first generated file |
| The licence notice | The repo is private and proprietary | `LICENSE` reads "All rights reserved" under Lattymoy; confirm the holder's name |
| Who reviews Rust besides Claude | Review is part of most rules | The owner's call |
