---
type: rule
---
# Agree to the Bit

The game's rules give the same result, to the bit, wherever they run. They live in one Rust crate: the server runs
it as the authority ([[Server-Authoritative Multiplayer]]), and a client that predicts runs the same crate compiled to
WebAssembly. The TypeScript client never decides an outcome. Inside it, maths goes through operations IEEE-754 rounds exactly (+ - * / and square root) or through a
pure-Rust maths library compiled into the crate, never through the platform's `sin`, `exp` or `powf`. No clocks, no
unseeded randomness and no iteration over unordered maps in a result.

**Why.** An MMO's server checks what clients do, and a ship riding a wave must stand at the same height everywhere.
DFO Online had to hand-write its own arctangent and ban `Math.sin` to make browsers agree. Here it holds by
construction: one crate, compiled for each target.

**Checked by.** When the rules crate exists: a clippy list of disallowed methods inside it, and a test that runs the
same inputs natively and as WebAssembly and compares the bits.
