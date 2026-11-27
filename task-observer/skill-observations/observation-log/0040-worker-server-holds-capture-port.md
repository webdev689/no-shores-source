---
id: 40
title: "A finished worker's preview server held port 5173, so every capture showed the worker's old build"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/webgpu-shot.cjs", "tools/claude-toolkit/workers/run-worker.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "family: the capture driver, the worker runner, the Toolkit's capture recipe. 0007 saw the same leftover server from a job's own `kill $!`; this one came from a worker that had finished."
area: "overlook-source, headless WebGPU captures with workers"
date: "2026-11-20"
session_context: "Capturing the prologue after a fire worker finished. Five rounds of captures (about an hour) were the worker's pre-merge build."
commands_verified: "ss -ltnp | grep 5173; readlink /proc/<pid>/cwd showed /root/wt/fire for `vite preview --port 5173`"
---

The fire worker left `vite preview --port 5173` (and a dev server) running from /root/wt/fire after it reported.
`npx vite --port 5173 --strictPort` in the main tree then failed quietly into its log, `curl localhost:5173` still
answered (the worker's server), and webgpu-shot.cjs captured the worker's old build: a probe finally showed fields
the current code has were missing. Proposals: run-worker.sh stops the worker's servers when it reports (by the pids
it started, or by cwd under the worktree); webgpu-shot.cjs prints which build it reached (fetch /src/<a file> or the
page's version) before its steps; the Toolkit's recipe checks `readlink /proc/$(pgrep -f 'vite.*5173')/cwd` first.

Recurred 2026-11-25, PR #209's before/after grass pictures, with no worker involved: one loop served each build with
`npx vite preview ... --strictPort &` and stopped it with `kill $!`. That kills the npx wrapper, not Vite, so the
"after" server kept 5173, the "before" server failed into its log, and the "before" picture was the "after" build.
The port check before the loop used `ss`, which this container lacks, so it printed nothing and looked clear. Caught
by reading the preview log before showing the owner; retaken after `pkill -f "vite preview --outDir"`. Third time
for this shape: it wants the barrier proposed above (webgpu-shot.cjs printing, or asserting, the build it reached),
not another line in the recipe.

## Seen again, 2026-11-26 (deeper dungeons; third with 0198)

- The storey-client worker, killed by the 2-hour limit, left `vite preview --port 5191` running from its worktree. The
  controller's `npx vite --port 5191 --strictPort` failed silently behind `nohup`, curl still answered 200, and one
  picture run (about 20 minutes) drove the worker's old build, timing out on its entrance prompt.
- Third occurrence: a barrier. webgpu-shot.cjs should refuse a plan whose server is not this checkout's: on start, read
  the listening process's cwd (`/proc/<pid>/cwd` of the port's owner, `ss -ltnp`) and fail unless it is the repo the
  driver runs from; and stop-worker.sh / run-worker.sh's exit should kill any vite the worker started.
