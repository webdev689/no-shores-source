---
id: 262
title: "A new island kit or dungeon pack leaves the committed-manifest test red until CI publishes it and its line is committed"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/islands/test_envelope.py", "bible/02-Systems/Island Modules.md"]
siblings_checked: "family: the module pipelines (tools/dungeon, tools/islands, tools/modules). checked: tools/dungeon's envelope test has no manifest test of the same shape; no entry covers it."
area: "no-shores-source, passages pieces worker"
date: 2026-11-25
session_context: "The pieces worker added the passage kit to content/islands/kits.json; tools/islands/test_envelope.py test_the_committed_manifest_names_the_contracts_kits_and_parts fails until the island-modules workflow publishes after a push and the controller commits its manifest line, so the branch is red between the push and that commit. A container restart killed a nine-style preview build (exit 137); the worker then built one style at a time. The preview sheet's camera sees the passage pieces' north fronts from behind, so a scratch rotate-180 render was needed. A stale untracked room.wasm needed npm run wasm before the client's island tests."
parked_until: "PR #240 merge"
resolved:
resolution:
reference:
commands_verified: "python3 -I tools/islands/test_envelope.py (one failure as above); git merge passages-pieces; git push"
---
Proposed: the manifest test names the kits the committed manifest lacks and passes while the contract's kits are a
superset of the manifest's on a branch not yet published (or CI writes the manifest line back itself); the preview
camera shows a piece's front.
