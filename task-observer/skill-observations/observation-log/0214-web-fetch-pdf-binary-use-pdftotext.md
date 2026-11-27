---
id: 214
title: "The web-fetch agent cannot read a PDF (it gets the raw binary), but WebFetch saves the file and pdftotext on it reads every slide"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "family: web research (Toolkit's Web research row lists sites that refuse; none covers PDFs). checked: no entry covers a PDF fetched as binary."
area: "web research for a design discussion"
date: 2026-11-24
session_context: "Enemy pressure research: Michael Booth's 2009 L4D AI slides (Valve's CDN PDF). The web-fetch agent reported the text as FlateDecode binary and gave no slide text; the harness note named the saved PDF under tool-results, and pdftotext -layout on it gave the Director's Build Up / Sustain Peak / Peak Fade / Relax text verbatim."
parked_until: "PR #244 merge"
resolved:
resolution:
reference:
commands_verified: "pdftotext -layout <tool-results/webfetch-*.pdf> booth.txt; grep -n -i relax booth.txt"
---
Proposal for the owner's review: Toolkit's Web research row gains "A PDF comes back as binary: read the file WebFetch saved with pdftotext -layout."
