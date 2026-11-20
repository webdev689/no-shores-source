---
id: 18
title: "A colour feature passed its tests while drawing nothing on most armour: the tests checked the data path, not the pixels"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "CLAUDE.md"]
siblings_checked: "none: the targets are the project's brief template and instructions, not a skill"
area: "verification of drawn features"
date: 2026-11-20
session_context: "Overlook factions round: faction gear colours and worn dyes were tested by asserting which ramp each layer got; rendering the figures from the published strips showed the ramps landed on greys only, so 9 of 17 armour sets took no colour at all; the owner then reviewed the renders and asked twice for brightness changes"
parked_until:
resolved:
resolution:
reference: "/root/wt/reports/audit-looks.md; /tmp scratch renders are session-local"
commands_verified: "node compose.ts over 17 sets measuring the share of pixels recoloured: run, 0% for 9 sets before the fix, 69-97% after"
---

**Issue:** The faction colours and the worn dye were tested by asserting the ramp assigned to each layer, and every
test passed. The compositor only laid a ramp on grey texels, and half the forge's armour sets are drawn in their own
colours, so on those sets the colour never appeared. Only rendering the figures with the real code and published
assets, and measuring the share of pixels that changed, exposed it; an earlier audit had marked the dye's reach
"checked and sound" from the same data-level reading.

**Suggested improvement:** For any change that is drawn (a colour, a look, a layout), the brief and the definition of
done require a picture from real assets with the real code, and a measured pixel-level check (share recoloured,
distinct colours, contrast), before the change is called done; audits of drawn features state whether they rendered.

**Principle:** A test of the inputs to a renderer is not a test of what it draws; a visual feature is verified only by
looking at, and measuring, the pixels it produces from real assets.
