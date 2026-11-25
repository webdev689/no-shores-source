---
type: decision
date: 2026-11-24
status: in force
---
# The Discord Bot Deploys on Each Merge

> Asked when the Discord bot (the Worker noshores-bot) deploys, offered "Like the accounts: CI deploys it from main
> once the check passes, only when the bot's code changed. Your yes to a merge covers it.": "On each merge
> (Recommended)"

## What it settles

- A merge into `main` deploys the [[Discord Bot]] once the same commit has passed the check, only when the bot's code
  changed, as the accounts and the rooms do ([[The Rooms Deploy When Their Code Changes]]).
- The owner's yes to a merge covers it ([[Ask Before Deploying]]).
- The Discord application's keys stay the owner's to add
  ([[DFO's Discord Bot Comes Over, Its Panel on the Website]]).
