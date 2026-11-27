---
type: procedure
---
# Recording a Decision

When the owner decides something, it gets a note in `05-Decisions`, made from the Decision template:

- **Title**: the decision, as a short statement.
- **Properties**: `type: decision`, the `date`, and `status` (in force, or replaced by another decision).
- **The owner's words**, quoted exactly as written.
- **What it settles**: the plain consequences, and nothing the owner did not say.
- **Links** to the rules and notes it affects, and a link to it from them.

Before changing a number or a law, run `cargo xtask decisions`: it maps the files changed against `origin/main`
through each note's `code:` to the decision notes that note links, and prints them. Read each in full and keep every
relation it sets (a ratio, an order, a cap), not only the number it names.

A decision that changes is not edited away: mark it replaced, link its successor, and record the new one. Only the
owner makes decisions; Claude records them and never writes one the owner did not make.

Where the owner hands a system over ("take some autonomy"), Claude's choices in building it go in one note named for
it ("Foe Arrivals as Claude Builds Them"), typed `claude-calls`, linking the owner's decision it builds on and listed
under "Claude's calls" in [[Decisions]]. Each choice is the owner's to change.
