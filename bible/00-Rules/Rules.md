---
type: index
---
# Rules

Twelve rules. Each is in force everywhere from the first commit: no baselines, no ratchets, no list of exceptions waiting
to shrink. Most are checked by `cargo xtask check` ([[Checks]]); the rest are held in review. Each comes from
something DFO Online taught us ([[Lessons from DFO]]). A new rule needs the owner's agreement.

| Rule | In short | Checked by |
|---|---|---|
| [[Own Work]] | Everything in the repo is made by us or by our tools | assets check, review |
| [[Agree to the Bit]] | The game's rules are one Rust crate; the server is the authority | lints, tests |
| [[Small Files]] | A source file holds 600 lines at most | size check |
| [[Names Say What They Are]] | Names are spelled out | clippy, ESLint |
| [[Comments Say Why]] | Eight lines at most, and no history | comments check |
| [[Notes Say How It Works Now]] | Each system has a note, updated in the same change | vault check, review |
| [[Tests Check Behaviour]] | Tests pin what the code does, never where its lines sit | review |
| [[Short Branches, Green Main]] | Small changes, merged within days; main always passes | CI, review |
| [[Generated Files Stay Out of Git]] | Renders, bakes and builds live outside git | assets check |
| [[Versions Are Not Counters]] | Migrations by timestamp, protocol versions by hash | versions check, review |
| [[Plain Text]] | Text is easily explained, never AI text, never bloat | review |
| [[Dialogue]] | Short lines, short scenes, no em dashes, every line heard | dialogue check, review |
