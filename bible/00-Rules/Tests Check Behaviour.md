---
type: rule
---
# Tests Check Behaviour

A test states what the code does, through its public functions, on inputs a reader can follow. No test pins a line
number, a line's text or a file's layout. A test is deleted with the behaviour it checks.

**Why.** DFO Online's tests grew to 5,142 files and 1.29 million lines, more than the code itself, and records tied to
line text were re-aimed more than 400 times.

**Checked by.** Review. The tests themselves run in `cargo xtask check`. How we test: [[Testing]].
