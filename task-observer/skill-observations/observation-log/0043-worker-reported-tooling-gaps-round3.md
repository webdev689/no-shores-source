---
id: 43
title: "Workers' observations, round three: wreck export iteration tools, early clippy, xtask past the background limit"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/wreck", "tools/claude-toolkit/workers", "client/index.html", "client/src/game/hud.css"]
siblings_checked: "family: worker briefs and the wreck pipeline. Relayed from the workers' OBSERVATIONS lines (workers do not log)."
area: "overlook-source, headless workers"
date: "2026-11-20"
session_context: "Workers wreck3, allies and ui after the owner's second playthrough."
commands_verified: "OBSERVATIONS lines in ~/wt/reports/wreck3.log and ui.log"
---

- wreck3: the export check stops at the first bad level, so the worker built a scratch "loose" export, a height map and a
  leak-path finder to iterate; worth adding to tools/wreck. Its first `cargo xtask check` failed only on clippy, which an
  early `cargo clippy` would have caught: briefs could say to run clippy before the full check.
- ui: `cargo xtask check` overran the 10-minute background limit (the headroom pattern's 590 s wait); the wreck tests'
  call recorder drops object arguments; the HUD's CSS is split between client/index.html and hud.css, which hid a
  doubled keycap size past 2400 by 1300 (fixed by the controller).
