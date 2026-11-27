---
type: procedure
---
# Porting from DFO

How a pick comes over depends on where it lands ([[TypeScript and Rust]]):

- **Client code** (engine, interface, tools): DFO's JavaScript comes over as TypeScript. Rename it `.ts`, type it
  strictly, cut the seams the pick list names, and rename to our own names. The logic stays.
- **GPU code**: rewritten for WebGPU and WGSL, with DFO's WebGL2 code as the specification ([[WebGPU Only]]). DFO
  stores a picture bottom row first and No Shores top row first, so a v ported from DFO's UVs comes out flipped.
- **Server and rules code**: rebuilt in Rust, with DFO's version as the specification.
What may come is in the [[Pick List]]; why we draw on DFO at all is [[Built From What DFO Taught Us]].
DFO's source is the repository `Lattymoy/dfo-online-source`: a cloud session attaches it and clones it shallow,
read-only, beside this one.

1. **The owner approves the pick.** Its row in the [[Pick List]] says approved.
2. **Make its Pick note** from the Pick template, in `06-Port/Picks/`. It records the DFO paths and the commit read.
   That record lives here, never in the code.
3. **Read DFO's version as a specification**: what it does, its data and tuning, the cases its tests pinned. Leave
   behind any seam the pick list names (Daggerfall data, lore, another author's work).
4. **Bring it over** as above, to the [[Rules]]. Carry over the behaviour DFO's tests checked as our own tests; drop
   its pins, mutant records and cites. For each DFO path the pick lists but the port leaves out, the Pick note names
   what it did and where our version does it, or that it is dropped. Grep the ported code's comments for parts they
   name that have no code behind them.
5. **Write its system note** in `02-Systems`, and link it from the Pick note.
6. **Mark the Pick note ported** in the same pull request.

Nothing Daggerfall, Morrowind or Daggerfall Unity made, and nothing from another author's mod, comes over: not
data, not words, not pictures, not code translated from them ([[Own Work]]).
