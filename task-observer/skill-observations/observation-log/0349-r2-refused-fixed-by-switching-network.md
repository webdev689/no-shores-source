---
id: 349
title: "A session started on the Default environment can reach R2 by moving its network to no-shores-source mid-session; check-tools and the Toolkit note say only to start the session there"
status: open
type: tool-clash
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/check-tools.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: Toolkit.md's NODE_USE_ENV_PROXY bullet and check-tools' R2 FAIL line both say to start the session in no-shores-source; neither names switch_environment"
area: "environment"
date: 2026-11-27
session_context: "PR #256 pick-up: check-tools' R2 ship mesh fetch answered 000 on Default; switch_environment (network_only) to no-shores-source made it answer 200 within seconds, and NODE_USE_ENV_PROXY=1 cargo xtask check then passed whole on 5663a09, shipTags.test.ts included"
parked_until:
resolved:
resolution:
reference: "PR #256, head 5663a09"
commands_verified: "node fetch of the R2 ship mesh with NODE_USE_ENV_PROXY=1: 000/cancelled before the switch, 200 after"
---
The R2 FAIL's advice could add: or move this session's network there (get_environment, then switch_environment network_only), which keeps the container. Proposed for the owner's review; not changed.
