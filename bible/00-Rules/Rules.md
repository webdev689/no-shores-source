---
type: index
---
# Rules

Ten rules. Each is in force everywhere from the first commit: no baselines, no ratchets, no list of exceptions waiting
to shrink. Most are checked by `cargo xtask check` ([[Checks]]); the rest are held in review. Each comes from
something DFO Online taught us ([[Lessons from DFO]]). A new rule needs the owner's agreement.

| Rule | In short | Checked by |
|---|---|---|
| [[Own Work]] | Everything in the repo is made by us or by our tools | assets check, review |
| [[Agree to the Bit]] | The rules give the same bits on the server and in every browser | lints, tests |
| [[Small Files]] | A source file holds 600 lines at most | size check |
| [[Names Say What They Are]] | Names are spelled out | clippy |
| [[Comments Say Why]] | Eight lines at most, and no history | comments check |
| [[Notes Say How It Works Now]] | Each system has a note, updated in the same change | vault check, review |
| [[Tests Check Behaviour]] | Tests pin what the code does, never where its lines sit | review |
| [[Short Branches, Green Main]] | Small changes, merged within days; main always passes | CI, review |
| [[Generated Files Stay Out of Git]] | Renders, bakes and builds live outside git | assets check |
| [[Versions Are Not Counters]] | Migrations by timestamp, protocol versions by hash | review, later a check |
