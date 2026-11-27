---
id: 39
title: "The headless capture printed 404s without their URL, and its preview server outlived the job"
parked_until: "PR #243 merge"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: the capture scripts used this session (the kit's webgpu-shot.cjs and a scratch copy). A page 'response' listener caught neither 404; message.location().url named both (favicon.ico)."
area: "overlook-source, headless WebGPU captures"
date: "2026-11-20"
session_context: "Checking the prologue's beats headless; two 'Failed to load resource: 404' lines in every capture."
commands_verified: "node shot-verbose.cjs probe404.json (with message.location().url printed)"
---

webgpu-shot.cjs:108 prints a console error's text only, so "Failed to load resource: 404" names no resource and each
run raises the same doubt (here the page's missing favicon.ico). Proposal: print message.location().url beside it.
Also, a job that starts `npx vite preview &` and later runs `kill $!` stops the npx wrapper and leaves vite serving on
the port, which blocks the next job's --strictPort; stop it by pattern (pkill -f "vite preview --port 5173").
Toolkit.md's capture recipe could carry both.
