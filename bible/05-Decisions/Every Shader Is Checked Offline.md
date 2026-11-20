---
type: decision
date: 2026-11-19
status: in force
---
# Every Shader Is Checked Offline

The owner, offered a check that would have caught the lightning bolts' shader that never compiled: "Add the check".

## What it settles

- `cargo xtask check` validates every shader the client compiles as WGSL, offline, before any browser runs it
  ([[Checks]]). A shader that would fail to compile fails the check.

[[Checks]], [[Toolkit]].
