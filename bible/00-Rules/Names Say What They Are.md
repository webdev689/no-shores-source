---
type: rule
---
# Names Say What They Are

Names are spelled out: `wind_speed`, not `ws`. Single letters are kept for loop counters, axes and maths everyone
reads at a glance (`i`, `x`, `t`, and the short list in `clippy.toml`).

**Why.** DFO Online spent about 400 commits spelling out short names after the fact.

**Checked by.** Clippy's `min_ident_chars` lint, denied in CI.
