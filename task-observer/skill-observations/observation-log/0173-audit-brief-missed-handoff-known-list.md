---
id: 173
title: "Audit briefs listed only a few known-left items, so auditors re-found findings the hand-off already records as left for the owner"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none: no installed skill owns the repo's audit brief; Toolkit.md 'Audits' says what a brief gives (scope, what is fixed, a findings format) but not where the known-left list comes from"
area: "briefing read-only audit agents"
date: 2026-11-24
session_context: "Whole-codebase audit with 12 read-only auditors. The common brief's 'Known, left on purpose' list was written from the hand-off's top sections only; bible/Hand-off.md 'The audit's findings left' (under Next) already lists content/forged missing from ROOMS_CODE, the binds clash (F held taken by a rebound Details), shaders.mjs reading only `code:` first and the html check missing .after/.before. The tools and UI auditors re-reported all four."
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: grep -n 'content/forged' bible/Hand-off.md -> line 594 lists it as left"
---

**Issue:** The controller wrote the auditors' shared brief after reading only the Done and Waiting sections of the
hand-off. The hand-off's later "audit's findings left" list held four findings the auditors then spent effort
re-finding and the controller re-verifying, and one (a deploy filter) was fixed before the overlap was noticed.

**Suggested improvement:** In Toolkit.md "Audits", add: the brief's known-and-left list is built from every
"left", "known" and "findings left" entry in the hand-off and open PR descriptions, grepped (`grep -n -i "left\|known"
bible/Hand-off.md`), not recalled from a skim.

**Principle:** Before fanning out reviewers, collect the full register of known, deliberately deferred issues from the
project's own records and hand it to every reviewer; a partial list costs duplicate findings and risks fixing what the
owner chose to hold.
