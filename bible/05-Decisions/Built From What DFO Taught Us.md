---
type: decision
date: 2026-11-14
status: in force
---
# Built From What DFO Taught Us

> "utilizing some of the changes not pushed like world 2.0, the forge sprite system, etc and systems weve developed
> within this repo"

> "a lot of what we have is ours. Forget the goddess, forget daggerfall unity. DFO is ours to pick a and implement to
> create something thats entirely ours"

> "really take everything learned from past mistakes and apply it here"

## What it settles

- DFO Online's own work, merged or not, is ours to draw on: its designs, algorithms, data, tuning and tools.
- The client is TypeScript ([[TypeScript and Rust]]), so DFO's JavaScript comes over and is typed as it is ported.
  The renderer's GPU code is rewritten for WebGPU ([[WebGPU Only]]). Server and rules code is rebuilt in Rust, with
  DFO's version as the specification.
- What comes over, and what stays, is the [[Pick List]]; how it comes over is [[Porting from DFO]].
- DFO's mistakes become rules: [[Lessons from DFO]].
