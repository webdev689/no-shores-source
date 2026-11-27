---
type: rule
---
# Tests Check Behaviour

A test states what the code does, through its public functions, on inputs a reader can follow. No test pins a line
number, a line's text or a file's layout. A test is deleted with the behaviour it checks.

**Why.** DFO Online's tests grew to 5,142 files and 1.29 million lines, more than the code itself, and records tied to
line text were re-aimed more than 400 times.

**Checked by.** The `client tests` repo check ([[Checks]]) refuses a client test that reads the rules' Rust source:
it compares with a fixture a Rust test writes under `target/`, or a content file both sides read. The `pins` check
refuses a fingerprint copied into both languages' tests. Review holds the rest. The tests themselves run in
`cargo xtask check`. How we test: [[Testing]].
