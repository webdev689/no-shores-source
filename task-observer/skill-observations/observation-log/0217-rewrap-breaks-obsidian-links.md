---
id: 217
title: "A python textwrap rewrap of a Hand-off entry split an Obsidian [[link]] across lines; the vault check failed the full check only at its end, 35 minutes later"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md", "CLAUDE.local.md"]
siblings_checked: "checked: the earlier rewraps this session (Server.md, Interface.md) had no links in the wrapped text; the vault check is in `cargo xtask repo`, which takes seconds, but the full check runs it last"
area: "rewrapping bible paragraphs to the 120-column width"
date: 2026-11-24
session_context: "PR #179, merging main #190 before the owner's 'Merge and deploy when ready': the guild entry in bible/Hand-off.md was rewrapped with textwrap.fill(width=120). It broke [[Guilds Gain Banners, Levels, Bounties and Outposts]] across two lines. cargo xtask check ran 35 minutes, passed every test, then failed on '[vault] ... breaks across lines'. Fixed by swapping spaces inside [[...]] and `...` for a placeholder before wrapping, then running cargo xtask repo (seconds) before the full check."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: cargo xtask repo -> 'repo checks: 3894 files, no problems' after the protected rewrap"
---

**Issue:** A plain textwrap breaks Obsidian links and code spans at their spaces. The repo's vault check catches this, but the full check runs it last, so the mistake cost a whole 35-minute run.

**Suggested improvement:** Rewrap bible text only with links and code spans protected (replace their spaces with a placeholder before wrapping). Always run `cargo xtask repo`, which takes seconds, before starting `cargo xtask check` after any edit to the notes.

**Principle:** Run the cheap check that covers your edit before the expensive one that covers everything.
