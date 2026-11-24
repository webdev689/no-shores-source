---
id: 195
title: "The offline shader check (naga) passed WGSL that Chrome's Tint refuses ('mixing * and ^ requires parenthesis'); the refused pipeline failed every frame's command buffer, land and all, and only a headless picture run caught it"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "crates/xtask/src/shaders.rs"]
siblings_checked: "none: no skill owns the shader checks; the gap is the repo's shaders check (naga) against the browser's compiler (Tint)"
area: "validating WGSL offline against what the browser compiles"
date: 2026-11-24
session_context: "No Shores, the meadow grass port: meadowShader.ts hashed with `a * K1 ^ b * K2 ^ salt`. `cargo xtask shaders` (naga over every shader) passed; in headless Chromium the module failed to parse, its pipelines were invalid, and every frame's command encoder that set them failed, so the whole scene went unrendered."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: cargo xtask shaders -> passed with the unparenthesised hash; run: node tools/claude-toolkit/webgpu-shot.cjs <plan> -> 'Error while parsing WGSL: mixing '*' and '^' requires parenthesis'; parenthesised -> rerun"
---

**Issue:** The WGSL spec requires parentheses when bitwise and arithmetic operators mix; naga (the offline check)
accepts the unparenthesised form, Tint (Chrome) refuses it. A new shader that passes the repo's check can still fail
in every browser, and a failed pipeline in a shared render pass takes the whole frame with it.

**Suggested improvement:** Have the shaders check also refuse what Tint refuses where naga is lenient: at the least a
lint for a binary bitwise operator (`^ & | << >>`) sharing an expression level with another operator, unparenthesised;
or run Tint (e.g. via headless Chromium's `createShaderModule` and `getCompilationInfo`) over the written shaders. And
in the toolkit note: picture any new shader headless before calling it done, since the offline check is not the
browser's compiler.

**Principle:** An offline validator built on a different compiler than production is a necessary check, not a
sufficient one; a change to code that only the production compiler finally judges needs one run through that compiler
before it is called done.
