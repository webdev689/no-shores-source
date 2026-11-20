---
id: 36
title: "A shell heredoc overwrote a test file a merged worker had just added, dropping two of its tests"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: controller edits after merging workers. The other test files the controller edited (stage, seaBeats, wreckProgress) were changed in place by exact-match replacement; every test file added since the foundation exists at HEAD."
area: "controller, after merging workers' branches"
date: "2026-11-19"
session_context: "Finishing the prologue; the controller added helm tests after the opening worker's branch had added helm.test.ts."
commands_verified: "run: git show 55a9308:client/src/game/prologue/helm.test.ts showed the two lost tests; restored in 5a43feb, 4 of 4 pass."
---

The controller created `client/src/game/prologue/helm.test.ts` with `cat > file <<EOF` after merging the opening
worker, whose branch had added a file of the same name with two tests. The heredoc replaced it silently; a second-round
auditor found the loss. The Write tool refuses to overwrite a file not read first, which would have stopped it.
Proposal: after merging workers, the controller creates files only with Write (never a shell redirect), or checks
`git ls-files <path>` first.
