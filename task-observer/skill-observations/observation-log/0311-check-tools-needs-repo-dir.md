---
id: 311
title: "check-tools.sh --worker run as the Toolkit says, without REPO_DIR, checks /root and FAILs serena, the pre-commit guard and the combined worker"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "tools/claude-toolkit/check-tools.sh"]
siblings_checked: "checked: Toolkit's 'Running the kit' says 'After any change to the kit, run bash tools/claude-toolkit/check-tools.sh --worker' with no KIT_DIR/REPO_DIR, while CLAUDE.md's install line sets both"
area: "the kit's checker"
date: 2026-11-26
session_context: "Audit and cleanup session: a docstring fix in check_tools.py; the checker run as written reported 4 FAIL (no REPO_DIR, so /root taken as the repo); rerun with KIT_DIR=$PWD/tools/claude-toolkit REPO_DIR=$PWD."
parked_until: "PR #242 merge"
resolved:
resolution:
reference: "scratchpad check-tools.log"
commands_verified: "bash tools/claude-toolkit/check-tools.sh --worker: run, 21 PASS 3 WARN 4 FAIL against /root"
---
