---
id: 222
title: "A ported module's comment named a counterpart that was never ported: the bot's slash commands had no writer to Discord"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Porting from DFO.md"]
siblings_checked: "checked: no skill family; the porting procedure is a project note, not a skill"
area: "porting from DFO: checking every counterpart a ported file assumes"
date: 2026-11-24
session_context: "PR #194, the Discord bot ported from DFO's unmerged branch. server/bot/commands.ts said 'Whatever writes the list to Discord writes this whole list', and nothing in the port (or DFO's picked paths, whose bot-deploy.yml was listed but not brought over) wrote it, so /panel, /rank and every module's command would never appear in Discord. Found only while building the bot's deploy; fixed with writeCommands and a deploy step."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: grep -rn 'commandsOf' server site -> used only by worker.test.ts before the fix"
---

**Issue:** A ported file's comment named a part of the system ("whatever writes the list to Discord") that the port
did not include. The pick note listed DFO's deploy workflow among its paths, but the port left it out without saying
what else lived in it, so the command registration it did was lost and the bot would have deployed with no commands.

**Suggested improvement:** In "Porting from DFO", add a step: for each DFO path the pick lists but the port leaves
out, name what it did and where our version does it (or that it is dropped on purpose); and grep the port's comments
for references to parts that have no code ("whatever", "the deploy", "a script").

**Principle:** A port is complete only when every duty of the files left behind has a named home; comments that refer
to an unnamed counterpart are the cheapest place to find the ones that do not.
