---
type: rule
---
# Comments Say Why

A comment says why the code is the way it is, in eight lines or fewer. How a system works goes in its note. History
(dates, pull request numbers, ticket tags, who asked for what) goes in git and the pull request, never in a comment.
A comment does not point into the bible: the note links to the code, not the other way round.

**Why.** DFO Online's source comments hold 3,860 distinct all-caps tags, and sweeping history back out of them took
its own tool and more than a hundred commits.

**Checked by.** The comments check, on every `.ts`, `.js`, `.rs` and `.py` file. Lines inside a doc comment's code example do not
count toward the eight.
