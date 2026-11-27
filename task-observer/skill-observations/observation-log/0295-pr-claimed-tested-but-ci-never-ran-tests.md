---
id: 295
title: "A pull request's 'tested offline' stood for weeks of pushes on which CI never reached the tests: the types step failed first on every head"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Making a Change.md"]
siblings_checked: "checked: CLAUDE.md's Done rule (cargo xtask check passes in CI on the head); 0294 (no run at all on a conflict) is the sibling for a missing run, this one for a run that stops early"
area: "reading CI's result before calling a pull request tested"
date: 2026-11-26
session_context: "Audit of #221: its body said the suites passed offline and left the full check to CI; every check run on its four heads failed at 'types (TypeScript)' (heldMapAsk.test.ts:78, a strict assert narrowing to never), so cargo test and npm test never ran in CI. The previous session ran the suites but never tsc on the test config. The same session's re-pinned fingerprint was never run in CI either."
parked_until:
resolved:
resolution:
reference: "CI job 139932413175 on 01c721ba; fix 1f846c5b on ccr-c7c30290-wwnvc5"
commands_verified: "mcp get_job_logs on the check job: run, showed the failure at types before any test step; npx tsc -p tsconfig.node.json: run, reproduced TS2339"
---

**Issue:** A pull request left "the full check to CI" and was handed over as waiting on the owner, but CI's check stopped at its types step on every push, so none of the pull request's tests had ever run in CI. Tests run by hand (node --test) strip types and never type-check, so a test file can pass locally and fail tsc.

**Suggested improvement:** Before handing a pull request over, read the check job's log on its head (not only its conclusion) and name the last step it reached; before pushing, run `npm run -s types` whenever a test file changed, since `node --test` does not type-check.

**Principle:** A check that stops early tested nothing after its stop: read how far it got.
