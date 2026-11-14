---
type: rule
---
# Agree to the Bit

The game's rules give the same result, to the bit, on the server and in every browser. They live in one crate that
both run. Inside it, maths goes through operations IEEE-754 rounds exactly (+ - * / and square root) or through a
pure-Rust maths library compiled into the crate, never through the platform's `sin`, `exp` or `powf`. No clocks, no
unseeded randomness and no iteration over unordered maps in a result.

**Why.** An MMO's server checks what clients do, and a ship riding a wave must stand at the same height everywhere.
DFO Online had to hand-write its own arctangent and ban `Math.sin` to make browsers agree. Here it holds by
construction: one crate, compiled once for each target.

**Checked by.** When the rules crate exists: a clippy list of disallowed methods inside it, and a test that runs the
same inputs natively and as WebAssembly and compares the bits.
