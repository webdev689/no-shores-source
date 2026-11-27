---
id: 46
date: 2026-11-20
project: overlook-source
skill: browser-qa (webgpu probes)
type: methodology
status: declined
resolved: 2026-11-27
resolution: "review 2026-11-27, dropped: obsolete. No HTML or CSS interface is left to match against (no `*.css` under client/; the html check refuses stylesheets, Checks.md:42)"
---
# Match GPU-drawn interface against the page's own CSS, pixel for pixel

**What happened.** Moving the HUD off HTML, each kit role was drawn through the GPU renderer into a probe texture
(SwiftShader cannot present a canvas, so a texture stands in for getCurrentTexture) and the same boxes were laid in
the page with the kit's classes, screenshotted at the same deviceScaleFactor, and diffed per role with PIL.

**What it caught.** (1) Outer box-shadows drawn under a translucent ground; CSS clips them to outside the border box.
(2) Chromium mitres a border's corners at device pixels, each diagonal pixel an even mix of the two edges.

**Pitfall.** The reference page first set an inline `border: 2px solid`, which resets the kit's border colours and
its border-image: set only `border-width` and `border-style` on reference boxes.

**Proposed rule.** Every GPU-drawn surface that replaces an HTML one gets this per-role diff before it lands; a role
passes within 2 levels of 255.
