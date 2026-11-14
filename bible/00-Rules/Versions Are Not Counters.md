---
type: rule
---
# Versions Are Not Counters

A database migration is named by its UTC timestamp, so two branches never claim the same number. A protocol or data
version is computed from what it describes (a hash of the schema), never bumped by hand.

**Why.** DFO Online's relay reached version 311 and its database 215 migrations, and about 170 commits did nothing but
renumber them after parallel branches collided.

**Checked by.** Review for now; a check arrives with the first migration or protocol.
