# render-checks-lost-under-worker-load

- Date: 2026-11-21
- Seen by: worker pagefix2 (OBSERVATIONS line), overlook-source, public events second audit
- What happened: (1) two webgpu-shot runs at 844x390 lost the headless WebGPU device at boot ("A valid external
  Instance reference no longer exists") while three workers shared four cores; the pictures worker logged the same
  error earlier. A render check could not be taken; a layout test stood in. (2) `vite preview` started with
  run_in_background died at the default 10-minute limit mid-shot. (3) xtask's 600-line file limit surfaced only in
  the full check at the end, forcing a late split of eventPropsDraw.ts.
- Proposed change: worker briefs that need render checks run them with no other worker rendering or compiling (one
  render worker at a time), start vite preview with an explicit long timeout, and run `cargo xtask repo` early after
  any edit that grows a file.
- Status: open
