---
id: 232
title: "The toolkit has no performance probe for the game's worker; a CDP probe (frame times, GPU call counts, CPU and allocation profiles, --trace-gc) found the hot spots, and stopping the heap sampler before the CPU profiler fakes a 455 ms frame"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/"]
siblings_checked: "none: the targets are the project's toolkit note and folder, not skills"
area: "measuring the game's frame cost headless"
date: 2026-11-24
session_context: "The owner's extreme performance pass. webgpu-stall.cjs only prints heap and frames. A scratch probe (scratchpad perf/perf-probe.cjs) serving a --minify false build, patching the game worker with the picture driver's DROP_SUBMITS/OWN_TEXTURE plus per-frame GPU call counters and a rAF timer, and attaching to the worker through the browser's CDP session (Profiler, HeapProfiler.startSampling with includeObjectsCollectedByMinor/MajorGC, Runtime.getHeapUsage), measured 2-4.6 MB of garbage a frame; --js-flags=--trace-gc with DEBUG=pw:browser confirmed it independently (122 MB/s scavenged in the hub). Without includeObjectsCollectedBy* the sampler reports only what is still alive (0.6 MB). Stopping HeapProfiler.stopSampling before Profiler.stop froze the worker and showed as one 455 ms 'follow' frame. Run-to-run variance of a 20 s window is about 15% in mean frame time and draw counts, so A/B compares need repeated runs or the allocation profile, which is exact per site."
parked_until:
resolved: 2026-11-27
resolution: "tools/claude-toolkit/webgpu-perf.cjs, with its row in Toolkit.md (Performance probe), the CPU profile stopped before the heap sampler (4f56f86b, on branch ccr-e8a0a01b-x0c5vj, awaiting the owner's merge)"
reference: "/tmp/claude-0/-home-user-no-shores-source/51e2aa2a-4e4d-53d1-a348-66126a6c437b/scratchpad/perf/perf-probe.cjs (session-local; the method is in this entry)"
commands_verified: "node perf-probe.cjs <dist> <plan> <out> (hub, patrol, sea, run; base and changed builds); TRACE_GC=1 DEBUG=pw:browser node perf-probe.cjs ... (225 scavenges in 20.8 s in the game worker)"
---

**Issue:** No tool in the kit measures what the game's frames cost in the worker. The picture driver and the stall probe drop GPU submits and count frames, but nothing records each frame's script time, the GPU calls it makes, or where its time and garbage go. Built in scratch, a probe did all of that and led straight to the fixes (the culls' per-frame arrays; the plants' list repacked whole on every tile crossing). Two traps: the heap sampler reports only live objects unless asked to include those the minor and major GCs collected, and stopping it before the CPU profiler stalls the worker, which reads as a giant frame in the profile.

**Suggested improvement:** Add a `webgpu-perf.cjs` beside `webgpu-stall.cjs` (the owner's call: a new tool), and a Toolkit row: plan steps as the picture driver's plus `{ "measure": seconds }`; stop the CPU profiler before the heap sampler; say that a single 20 s window varies about 15%, so compare builds with the allocation profile or repeated runs.

**Principle:** When measuring through a profiler, stop the instruments in the reverse of their intrusiveness (the cheap sampler last), and check one instrument's headline against an independent one (a GC trace against an allocation sample) before acting on it.
