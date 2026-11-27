---
type: decision
date: 2026-11-27
status: in force
---
# Pull Requests Sample the World's Sweeps, the Full Sweep Runs Nightly, and Builds Link Faster

The owner's words, on `cargo xtask check` taking long in every session and in CI: "The cargo check even on multiple
sessions is so long". Offered: (1) sessions leave the full check to CI, as the rules say, made clearer in the kit;
(2) on a pull request the eight world-wide sweeps (the rooms' own, `sites_held`, the passages', `runs_walked`,
`runs_planned`, `layouts_laid`, `landings_safe`, `rooms_walked`) check a sample, and the whole sweep runs nightly on
`main`; (3) faster compiling, a faster linker and a shared build cache:

> "1. Please do
> 2. Do it
> 3. Do it"

## What it settles

- A session runs the repo checks and the tests of what it changed, never the whole `cargo xtask check`; CI runs that
  ([[Toolkit]], [[Checks]]).
- On a pull request, and wherever the check runs but the nightly run, the world's sweeps a sample can stand for check
  a sample; the nightly run on `main` checks them whole ([[Checks]]).
- Builds are made faster where a measurement shows it helps ([[Checks]]).
