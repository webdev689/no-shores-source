---
type: rule
---
# Generated Files Stay Out of Git

Anything a tool makes (forge renders, world bakes, web builds) is generated from sources in the repository and stored
outside git, addressed by the hash of what it is. Git holds the sources and the tools, never their output. No file in
git is over 1 MB.

**Why.** DFO Online kept forge renders in 251 branches of their own, and its deploy needed size guards at 900 MB and
1.8 GB.

**Checked by.** The assets check.
