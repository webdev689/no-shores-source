---
id: 268
title: "A client module that imports fonts cannot load under node --test, so its new failure path was checked by types only; and the audit's headless picture driver lost the GPU device after about three shots"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "client/src/game/travel.ts"]
siblings_checked: "checked: instance-specific to this repo's client test setup and its headless WebGPU pictures; no skill covers either"
area: "client tests and headless pictures"
date: 2026-11-25
session_context: "Passages session, fix worker fxway: `travel.ts`'s new `wayOut` (the failed way falling back through tripOrBack) and the foot's walk path could not be tested because travel.ts's font imports fail under node; the audit's drive.mjs (SwiftShader WebGPU) crashed the page after about 3 GPU shots, so the worker ran one shot per process."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/fxway.md (Tests, OBSERVATIONS); /tmp/claude-0/-home-user-no-shores-source/83f21cd6-8d70-5dae-b616-0dd42cb04b33/scratchpad/audit/visual/drive.mjs"
commands_verified: "none run by the controller; from the worker's report"
---

**Issue:** Logic that lives in a module which imports fonts (or any asset node cannot load) cannot be reached by a unit
test, so a worker ships a failure path checked by types only. Separately, headless WebGPU under SwiftShader loses its
device after a few shots in one page, so picture scripts must restart per shot, which no note says.

**Suggested improvement:** keep decisions (where a failed way goes) in a plain module the test can load, with the
font-importing module only wiring it; and say in Toolkit.md's pictures section that one GPU shot per process is the
working pattern under SwiftShader, until the device loss is understood.

**Again (fxlook, same session):** the headless game page still lost its GPU device ("A valid external Instance
reference no longer exists"), so no in-game comparison picture could be made; the worker compared against the audit's
notes only. Also: `IslesNature` keeps its tiles once per `fromEye` array, so a caller reusing one matrix drew no plants;
the contract is not stated where a caller would see it.
