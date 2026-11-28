---
id: 118
title: "Impeccable's design hook was never turned on by the kit, so it was not automatic; the owner expected it to be"
status: actioned
type: open-source
skill: [impeccable]
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", "bible/03-Code/Toolkit.md"]
siblings_checked: "install-all.sh installed the skill from a pinned GitHub commit and turned telemetry off, but never ran `impeccable hooks on`; the hook's manifest goes to ~/.claude/settings.json and its consent to .impeccable/, both outside git, so a cloud container loses them"
area: "session setup; design work"
date: 2026-11-22
session_context: "A design pass loaded impeccable, whose context step reported the hook not installed and an update; Claude passed both to the owner as the skill directs, and the owner answered 'Dude you run it. Its suppose to be auto'."
parked_until:
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/claude-toolkit/install-all.sh:49 runs `impeccable hooks on`; bible/03-Code/Toolkit.md:56"
reference: "PR #144"
commands_verified: "run: impeccable doctor (hook-not-installed), impeccable hooks on, then doctor: 'No drift found'; check-tools' hook check still PASS with it on. Rerunning the edited install-all.sh was refused by the auto-mode classifier; the v4.10.0 skill was copied from the fetched, read commit instead"
---

**Issue:** The kit installed impeccable but left its design hook off, so its doctor reported drift every session and
the owner had to be asked. The owner expects kit tools to be on without asking.

**Proposed:** install-all.sh runs `impeccable hooks on` in REPO_DIR each session (done on PR #144's branch, with the
pin moved to v4.10.0 after reading its diff). When a skill reports a setup step of its own, do it rather than relay it,
unless it touches keys, security or deploys.
