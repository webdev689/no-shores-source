---
type: procedure
---
# Making a Change

1. **Branch** from an up-to-date `main` ([[Branches and Merging]]).
2. **Make one change.** If it grows past a few days of work, split it, or merge the finished part switched off.
3. **Test the behaviour** you added or changed ([[Testing]]).
4. **Update the note** of every system whose behaviour changed, or write one ([[Writing Notes]]).
5. **Run `cargo xtask check`** until it passes.
6. **Open a pull request.** Its description says what changed, why, and how it was tested. History goes here, not
   in the code or the bible.
7. **Ask the owner**, then squash-merge once CI is green on the branch's latest commit, and delete the branch. Every
   merge into `main` and every deploy waits for the owner's yes ([[Ask Before Deploying]]); a merge deploys the page
   and, when their code changed, the rooms, so its yes covers them ([[The Rooms Deploy When Their Code Changes]]).

## Done means

- `cargo xtask check` passes on the branch's head.
- Every behaviour change has a test and an up-to-date note.
- Nothing in the change invents game design: design comes from the owner ([[The Owner Sets the Vision]]).
