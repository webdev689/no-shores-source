---
id: 189
title: "Web research for a game's rules found the main wiki (destinypedia.com) and pcgamer.com unreachable at DNS from the cloud session; the Toolkit's list of sites to skip names neither, so the research agent spent fetches learning it"
status: parked
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: the Toolkit's Web research row lists reddit, GameSpot, GameFAQs, Tom's Hardware, dotesports and fandom as refusing; instance-general: a list of unreachable sources kept beside the research tool saves each session rediscovering it"
area: "web research from a cloud session"
date: 2026-11-24
session_context: "Revive, respawn and relog session: a background research agent asked for Destiny's death and revive rules could not WebFetch destinypedia.com or pcgamer.com (DNS failure under the session's network allowlist) and fell back to WebSearch snippets, so several numbers stayed unconfirmed."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: none
---

**Issue:** A research brief pointed the agent at destinypedia.com as the non-fandom Destiny wiki. Every fetch there, and to pcgamer.com, failed at DNS because the cloud environment's network allowlist does not include them. The Toolkit note's Web research row lists only sites that refuse fetches (fandom, reddit and others), so neither the brief's author nor the agent knew beforehand, and the research ran on search snippets.

**Suggested improvement:** Add destinypedia.com and pcgamer.com to the Toolkit's Web research row as unreachable from the cloud environment's network (a DNS failure, not a refusal), with the remedy: the environment's allowed hosts, which the owner approves.

**Principle:** Keep the list of sources a research tool cannot reach beside the tool's instructions, separating "refuses automated fetches" from "blocked by this environment's network", since only the second has a fix the user can make.
