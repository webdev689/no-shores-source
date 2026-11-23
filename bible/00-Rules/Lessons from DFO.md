---
type: reference
---
# Lessons from DFO

DFO Online went from its first commit to 14,623 commits on `main` and 1,674 pull requests in about four and a half
months. Much of it worked; some of it cost us. These are the costs, measured from its history, and what No Shores does
instead. Counts are commit subjects across `main`, the newest branch and the server branch (11,886 commits, plus 5,264
merges).

| What happened in DFO | Evidence | What No Shores does |
|---|---|---|
| Files grew until they had to be split by force | `world.js` 33,254 lines; 25 files over 3,000; a ceiling per host; ~127 split commits | [[Small Files]], checked from day one |
| Rules arrived late, as ratchets that "only go down" | 5 baseline files; ~400 commits spelling out names; ~240 cutting words; ~135 sweeping comments | Every rule holds everywhere from the first commit ([[Rules]]) |
| Tooling tied to line text churned on every edit | ~416 commits re-aiming mutant records; ~241 re-resolving cites; ~1,350 moving pins | [[Tests Check Behaviour]]; notes link files and symbols ([[Notes Say How It Works Now]]) |
| History filled the comments | 3,860 distinct all-caps tags in source comments | [[Comments Say Why]], checked |
| Branches lived long | 1,319 branches; the newest work 1,793 commits ahead of `main`; 31% of commits are merges | [[Short Branches, Green Main]] |
| Generated art lived in git | 251 forge shard branches; deploy size guards at 900 MB and 1.8 GB | [[Generated Files Stay Out of Git]] |
| Version counters collided | ~172 commits renumbering relay and database versions; relay at version 311; 215 migrations | [[Versions Are Not Counters]] |
| Words grew long and were cut back later | ~240 commits cutting words; a word-count baseline that could only go down | [[Plain Text]], held in review from the first line |
| Rules moved to the server after the fact | The server branch: 734 commits moving foes, loot and spells onto the server | The server is the authority from its first line, running one Rust rules crate ([[Server-Authoritative Multiplayer]]) |
| Agreeing to the bit took discipline | World 2.0's exact kit bans `Math.sin` and hand-writes an arctangent | [[Agree to the Bit]], by construction |
| Tests outgrew the code | 5,142 test files, 1.29 million lines | [[Tests Check Behaviour]]; [[Testing]] |
| The bible outgrew its readers | 263 pages, 355,000 words, 7 pages over 3,000 words | One note per system, how it works now; decisions kept apart |
| The world had a fixed size, widened later | The Tamriel-wide baseline: map bounds hard-coded to the Bay, then unpicked | No fixed world size in the code's keys or bounds |
| Other authors' work was ported, then replaced | The Own Work page's record of retired folders; a ship system ported off a mod's compiled code | [[Own Work]] |
| Prototype pages piled up at the root | 26 HTML entry pages at the repository root | Labs live in their own folder, by decision ([[Code Map]]) |
| Formatting and types covered part of the code | ~349 format commits; a formatter list of owned folders; types only at "the seams" | Prettier, rustfmt, strict TypeScript and the Rust compiler cover everything ([[Toolchain]]) |

## What DFO got right, and we keep

- A written bible that says how things work, held to the code by a check.
- Owner decisions recorded in the owner's words.
- One command that tells you whether a change is done.
- Determinism treated as a requirement, not a hope.
- A scan that proves no outside data is in the tree.
