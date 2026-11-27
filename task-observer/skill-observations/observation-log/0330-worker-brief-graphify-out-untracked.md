---
id: 330
title: "A worker's brief told it to `git checkout -- graphify-out`, which fails in a worktree where graphify-out is not tracked; a stale wasm's error never says it is stale"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the same template line is in every brief cut from brief-common-template.md this session (outpost-modules, outpost-sites, outpost-room, outpost-page, outpost-delve)"
area: "headless workers: the common brief's graphify and wasm steps"
date: 2026-11-23
session_context: "Guild outposts session: the outpost-sites worker reported in its OBSERVATIONS line that graphify-out is not tracked in its worktree, so the brief's `git checkout -- graphify-out` failed; that a client test failed with \"unknown variant `outpost`\" until `npm run wasm` was rerun, the error not saying the wasm was stale; that garrison.rs sat at 599 lines so a one-line comment hit the 600-line rule; and that context7 and skillsmp were refused by the proxy (403)."
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/outpost-sites.log (OBSERVATIONS line)"
commands_verified: "run: python3 tools/claude-toolkit/workers/audit.py /root/wt/outpost-sites -> MISSING (defect): none; FIRST3 ok"
---

**Issue:** The common brief tells every worker to `git checkout -- graphify-out` before a rebase or commit, but in a
fresh worktree graphify-out is untracked, so the command fails and the worker has to work out that it can skip it.
Separately, a Rust enum gaining a variant (`NodeKind::Outpost`) makes the client's tests fail with "unknown variant"
until `npm run wasm` is rerun; nothing in the error points at a stale build, and the worker lost time on it.
context7 and skillsmp were refused by the proxy for this worker, as for earlier ones.

**Suggested improvement:** In `brief-common-template.md`, make the graphify step conditional ("if `git ls-files
graphify-out` lists anything"), and add one line: "a client test failing with `unknown variant` after a Rust enum
changed means the wasm is stale: `npm run wasm`". In `bible/03-Code/Toolkit.md`, note context7 and skillsmp are
unreachable from cloud sessions behind the proxy, so briefs stop asking for them there.

(Renumbered from #321 at the 2026-11-27 review: two observations held that id.)
