---
type: rule
---
# Plain Text

Text is easily explained. A player reads a line once and knows what it means; a note says how a thing works in the
words a newcomer would use. Nothing reads as AI text: no stock phrases, no flourish, no words that sound weighty and
say little. Nothing is bloat: a line that adds nothing goes. The owner's example: not saying XP everywhere, but
showing an item's growth as a square filling round its locked nodes and a gauge on its icon.

**Why.** The owner set it ([[Text Is Plain]]), the growth a square since
[[A Hover Card's Perks Are Their Icon and a Short Line, and Plain Text's Growth Is a Square]].

A line in a note or a code comment is at most 120 characters, as the formatters hold code; a longer one wraps,
unless it cannot (a table row, a heading, fenced code, a URL, one unbreakable word). `tools/rewrap/rewrap.py` wraps one
without changing a word.

**Checked by.** Review, and the width by the comments and vault checks ([[Checks]]).
