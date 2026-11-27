---
id: 114
title: "Serena has no Python language server, so a worker brief's Serena steps fail on tools/*.py"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "tools/claude-toolkit/workers/run-worker.sh"]
siblings_checked: "assumed: header rebuilt from the body at repair on 2026-11-26; the sibling check is due at the review"
area: "worker briefs and Serena's languages"
date: 2026-11-21
session_context: "Public events' second audit; again on fpforge and #211's airship worker"
parked_until: "PR #242 merge"
resolved:
resolution:
reference:
commands_verified: none
---
# 0091 serena-has-no-python-server

- Date: 2026-11-21
- Seen by: worker assetsfix2 (OBSERVATIONS line), overlook-source, public events second audit
- What happened: the worker brief (common2/common3.md) requires Serena get_symbols_overview on every file the worker
  will change and find_symbol before every function edit. The Serena project is created by run-worker.sh with
  serena-languages.sh, which gives only rust and typescript; tools/*.py (kit.py, forge_publish.py, latticekit.py)
  got no symbols, so the worker fell back to grep/sed and scripted rewrites.
- Proposed change: the brief template says the Serena steps apply to Rust and TypeScript files; for Python, read with
  Read/Grep and edit with Edit. Or add python to serena-languages.sh when tools/ holds .py files the item changes.
- Status: open

**Instance (2026-11-23, worker fpforge):** Serena's get_symbols_overview failed on `tools/forge/tools/sprite-forge/fplayers.py` (no Python language server), so the worker used Read and Edit. `graphify explain` found the file only by its bare name (`fplayers.py`); the path form the brief gave found no node. Briefs that name a Python file for graphify should give its bare name.

**Instance (2026-11-26, worker airship-model, No Shores #211's last audit):** the brief's Serena steps failed on `tools/modules/airship.py` (no Python language server in the worktree's project, rust and typescript only); the worker read and edited with Read and Edit. audit.py still passed it (serena counted 2 calls).
