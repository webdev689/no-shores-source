---
id: 350
title: "Before the repository went public, a full-history secret scan had no allowed tool: running a downloaded gitleaks release was refused by the auto-mode classifier"
status: open
type: tool-clash
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the kit pins no secret scanner; GitHub MCP run_secret_scanning takes only pasted content (100 strings), not a history"
area: "security"
date: 2026-11-27
session_context: "The repository moved to webdev689 and was made public; a checksum-verified gitleaks 8.21.2 download and run was refused as Undermining Oversight; a scratch regex scanner over git log --all -p (5,837 commits, 197 branches) found no key"
parked_until:
resolved:
resolution:
reference: "PR #264"
commands_verified: "python3 -I scratch scan_secrets.py over git log --all -p: one false hit (a test fixture)"
---
The kit could pin a secret scanner (gitleaks by its release's SHA-256, as rtk is pinned) so a session can scan the history
before a visibility change. Proposed for the owner's review; not changed.
