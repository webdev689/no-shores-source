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

A change that builds or records a decision has a fidelity review before its pull request: put the owner's words,
and any recommendation of Claude's they said yes to, in a file, and run
`bash tools/claude-toolkit/workers/fidelity-review.sh <that file> <base>..<head>`. A reviewer measures the change
against those words alone and lists everything built or recorded beyond them, every paraphrase, and every "What it
settles" line the owner did not say. Fix or answer each finding, then put the report's verdict line under
"## Fidelity review" in the pull request's description: CI's `fidelity` check fails a pull request that changes a
decision without it.

A decision that changes is not edited away: mark it replaced, link its successor, and record the new one. Only the
owner makes decisions; Claude records them and never writes one the owner did not make.
