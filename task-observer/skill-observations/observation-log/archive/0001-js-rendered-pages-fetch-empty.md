---
id: 1
title: "Web research: JS-rendered pages fetch as empty shells; headless Chromium reads them"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Toolkit.md"]
siblings_checked: "none — target is the project's Toolkit note, not a skill in a family"
area: "Toolkit, web research row (no row exists yet; Browser QA covers only the game's own pages)"
date: 2026-11-20
session_context: "Researching how Destiny shows enemy health bars, for Overlook's foe plates"
parked_until:
resolved: 2026-11-20
resolution: "Applied on PR #96 (branch ccr-800481d9-kbbd62-kit), waiting on the owner's merge: a 'Web research' row in bible/03-Code/Toolkit.md's Tools table (first review, 2026-11-20)."
reference:
commands_verified: "run: NODE_PATH=$(npm root -g) node render.cjs <out> <url> — bungie.net TWID pages gave 43,803 and 26,655 chars of text where web-fetch gave 10"
---

**Issue:** web-fetch returned only "Bungie.net" (10 characters, HTTP 200) for two of Bungie's This Week in Destiny posts,
which a fetch agent reported as a failure. The pages build their text with JavaScript. Rendering the same URLs with
the container's preinstalled Playwright Chromium (`page.goto` with `networkidle`, then `document.body.innerText`) read
them whole. Separately, WebSearch refuses `allowed_domains: ["reddit.com"]` with a 400 (the domain is closed to its
user agent), and GameSpot, GameFAQs, Tom's Hardware and dotesports answer web-fetch with 403; fandom answers 402.

**Suggested improvement:** a "Web research" row in `bible/03-Code/Toolkit.md`'s Tools table: an HTTP 200 page with
almost no text is a JavaScript page, not a failure: render it with the preinstalled Chromium and read
`innerText`; reddit is not reachable through WebSearch; note the sites that refuse fetches so a session does not
spend calls on them.

**Principle:** an HTTP 200 with a near-empty body is a claim about the fetcher, not about the page: re-read it with a
real browser before calling the source unreadable.
