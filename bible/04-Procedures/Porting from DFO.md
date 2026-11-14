---
type: procedure
---
# Porting from DFO

DFO Online is the specification, not the source: Overlook is Rust, so every pick is rebuilt.
What may come is in the [[Pick List]]; why we draw on DFO at all is [[Built From What DFO Taught Us]].

1. **The owner approves the pick.** Its row in the [[Pick List]] says approved.
2. **Make its Pick note** from the Pick template, in `06-Port/Picks/`. It records the DFO paths and the commit read.
   That record lives here, never in the code.
3. **Read DFO's version as a specification**: what it does, its data and tuning, the cases its tests pinned. Leave
   behind any seam the pick list names (Daggerfall data, lore, another author's work).
4. **Write it in Rust**, in our own names, to the [[Rules]]. Carry over the behaviour DFO's tests checked as our own
   tests; drop its pins, mutant records and cites.
5. **Write its system note** in `02-Systems`, and link it from the Pick note.
6. **Mark the Pick note ported** in the same pull request.

Nothing Daggerfall, Morrowind or Daggerfall Unity made, and nothing from another author's mod, comes over: not
data, not words, not pictures, not translated code ([[Own Work]]).
