---
id: 194
title: "A collision tolerance chosen from first principles (0.25 m) multiplied a world's boxes 5.6x, and a cap was later set the same way; both times the aggregate cost was measured on one part of the real data (continent 1) and only later on all of it, forcing rework"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["CLAUDE.local.md"]
siblings_checked: "none: no skill owns geometry or tolerance tuning; the habit belongs in the project's working notes"
area: "choosing a tolerance that a system applies to every element"
date: 2026-11-24
session_context: "No Shores, invisible climbable prop bounds: boxes made to keep within KEEP_M of each solid and prop. At 0.25 m the continent's zones went from 22,518 boxes to 237,335; tilted rubble domes alone were 44,000 in one zone. The codebase already had a precedent (halls.rs OVERSHOOT_M = 0.45) that settled it at 2.75x once found."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "run: cargo test -p room --test zz_prop_probe (a temporary probe) -> totals 237,335 at 0.25 m, 61,851 at 0.45 m with tilt rules, 70,268 final; old code 22,518. Second instance: cargo test --release -p room --test zz_counts over all nine continents -> 3,178,600 boxes uncapped against 272K on main (cities 21x), up to 11,168 of one solid over a 2 m movement cell; main measured from a git worktree of the merge base"
---

**Issue:** A tolerance for how far a collision box may stand off the drawn shape was picked from a feel for what a
player notices (a quarter metre), implemented across every shape, and only then counted over the real world: 10x the
boxes. Each later fix (a halving floor, a near-round rule, a still-tilt rule) was found by re-running the count. The
codebase already held the answer (an existing overshoot constant for slanted walls at 0.45 m), found late by grepping.

**Suggested improvement:** Before implementing a tolerance that every element of a large dataset obeys, (1) grep for
an existing constant that already encodes the project's accepted tolerance for the same thing, (2) write the
aggregate probe first (old count, new count by category, on the full real data) and run it on a crude prototype of
the rule, then choose the number.

**Principle:** A per-element quality rule has a whole-system cost; measure that cost on the real population, against
the old baseline and any precedent already in the code, before committing to the number.

**Second instance (same session, later):** an audit flagged a cost blow-up, and a per-solid cap (256 boxes, keep
doubled) was added and called fixed with only a contrived landmark checked. Measured over every continent, the cap
was the wrong shape: long turned city walls legitimately need 700+ strips, while the real cost was crowding (thousands
of layered boxes over one movement-grid cell) and file size (node files 16 MB to 54 MB). The fix needed the per-cell
crowding metric, a terrace decomposition and a two-limit budget, each chosen from the full-population probe. The test
measure itself was also wrong for two shapes (a pyramid measured as a cone, an elliptical dome as a circle), which made
correct boxes look 7-12 m off. Add to the suggestion: (3) measure the cost on the whole population, not the first
region, and on the metric the runtime pays (here boxes per grid cell, bytes per room file), not a proxy (boxes per
solid); (4) when a test's misfit looks absurd, check the test's model of the shape before the code.

