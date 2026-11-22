---
type: decision
date: 2026-11-22
status: in force
---
# The Broadside Warning Is Written Over the Sea, Not a Panel

> "Also rework the brace warning to be something less of a panel and more of a detailed warning"

> "That is too much text and way to small. The brace ui change"

## What it settles

- The warning that a captain's guns are run out at the player is not a boxed panel ([[Interface]], "The broadside
  warning").
- It is large and has few words.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| Its look | No panel: outlined words over the sea, "BROADSIDE" in blood red capitals at three times the words' size between two blood triangles round a "!", pulsing to pale | As the game's other warning, "Return to the area", stands |
| Its words | Three lines: BROADSIDE, the fuse, and BRACE at twice the words' size beside its keycap | "too much text and way to small": who, where, the shot and the other batteries were cut from the screen |
| When it shows | While a hostile captain afloat has a side run out with the Sloop within 45° of its beam (`runOutAt`) | An ally's guns, or a side run out at another ship, are no broadside at the player |
| The tell | A 4 px fuse under the title burning in from both ends over the captain's 1.3 s tell, timed from when that battery ran out, then flashing every quarter second with the title as the battery may fire | A captain fires no sooner than 1.3 s after running out, and runs in 2.5 s after that; the fuse says when to brace without a word |
| Braced | "BRACED" in brass, with no keycap | The press is done |
| Where it comes from | The compass mark of every captain with a battery run out at the player lit pale red | The compass points to it without words |
| A screen reader | One line once as it comes: whose battery, how far and where from the bow, its shot and what it does, and the brace | What the screen leaves out is still heard |
| Past 1440p | Doubled, with the plate and the bar | "way to small" |
| Reduced motion | No pulse and no flash; the fuse still burns | The fuse is information, the pulse is not |

Links: [[Interface]], [[Naval Combat]].
