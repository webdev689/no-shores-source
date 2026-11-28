---
id: 160
title: "A web-research worker could open no page (wikis, bungie.net and the Wayback Machine all failed) and built every number from WebSearch's summaries; the brief had not asked it to say which numbers it read and which it was told"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "checked: Toolkit.md's Web research row lists the sites that refuse WebFetch (reddit, GameSpot, GameFAQs, dotesports, fandom) but not that a cloud session's proxy may refuse every fetch; the brief template has no line for source quality. Instance-general: any delegated research."
area: "delegated web research in a cloud session"
date: 2026-11-23
session_context: "The balance and economy pass after Destiny 1 vanilla: a background research agent gathered D1's numbers (XP, Light, marks, engrams, Ascendant materials, Xur). It reported that destinypedia, destinygamewiki, the fandom mirrors, kotaku, bungie.net and web.archive.org all failed to fetch, so each number was a search engine's summary of the cited page. Its brief asked for a confidence tag per number, which caught it; without that line the report would have read as page-checked.; worker shape: origin/main was 13 commits behind its base, so it reviewed 8d698c1f~1..8d698c1f by hand; worker breach likewise"
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference: "the agent's file d1-vanilla.md in that session's scratchpad (not kept)"
commands_verified: "none"
---

**Issue:** A research worker in a cloud session could not fetch any of the pages it found; it used WebSearch's
summaries as the source of every number. The brief happened to ask for a confidence tag per number, so the report said
so plainly. A brief without that line would have returned the same numbers looking page-checked.

**Suggested improvement:** In the Toolkit note's "Web research" row, and in any research brief, ask the worker to tag
each fact as read on the page, or only from a search summary, and to say up front when fetches failed. Treat
summary-only numbers as unchecked in what is recorded.

**Principle:** When a researcher cannot reach its sources, the report must say how each fact was obtained; ask for
that in the brief, since a delegate's summary flattens "read" and "was told" into the same confident line.

**Instance (2026-11-23, workers shape and breach):** each found `origin/main` far behind its fork point and reviewed a hand-picked range instead. Shape also ran `cargo test` over four crates past the 600 s foreground limit twice while sharing CPUs, and had to background it.
