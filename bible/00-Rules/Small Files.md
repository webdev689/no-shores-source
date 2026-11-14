---
type: rule
---
# Small Files

A source file holds at most 600 lines; a test file at most 800. A file that needs more is two modules. Code that
wires modules together (a host) wires; it does not implement.

**Why.** DFO Online's `world.js` grew to 33,254 lines and 25 files passed 3,000. Splitting them afterwards took a
ceiling per host, a ratchet, and more than a hundred commits.

**Checked by.** The size check, on every `.ts`, `.js`, `.rs` and `.py` file.
