---
id: 90
title: "A cloud session cannot publish forge renders: the Default environment holds no Cloudflare token, despite r2.py's word"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/r2.py", "bible/03-Code/Sprite Forge.md", "bible/03-Code/Toolkit.md", ".github/workflows/forge.yml"]
siblings_checked: "family: R2 publishers (forge_publish.py add/publish, the birds and weapon art via the forge workflow); only the figure strips' local add tried."
area: "overlook-source, #119's open items"
date: "2026-11-21"
session_context: "26 figure layers re-rendered for both bodies (about 90 min on 4 cores, two 30-min background kills resumed by the render cache) and then `forge_publish.py add` refused 400: Missing Authorization."
commands_verified: "python3 -I tools/forge_publish.py add (refused); get_environment: Default, network_secrets []"
---

- `tools/r2.py` said a cloud session's network adds the token itself; the Default environment has no network secret,
  so the upload went unsigned. The docstring now says so. Find this before a long render, not after: check
  `get_environment`'s network secrets for api.cloudflare.com first.
- The `forge` workflow (which holds the token) renders only the birds and the large weapons, with a 20-minute limit;
  figure layers cannot go through it as it stands. A change there touches a workflow with the token: the owner's call.
- Long renders: launch with the 2-hour background timeout; the default 30 minutes killed both runs (the cache resumed).
- Also: new-observation.sh failed its floor write on claim markers named `NNNN-` (`10#0091-`). Their source was
  toolkit-data.sh's `renumber`, which moved a claim marker as if it were an observation (`.id-claims/0090` to
  `.id-claims/0093-`) and then failed a save on a name taken. Fixed in the repo: only `NNNN-*.md` moves, and only on
  another observation's number; toolkit-data-test.sh covers it. The dashed markers were removed and the floor set to 91.
- Proposed: a Toolkit.md line (publish needs the token on the environment or the workflow), and a pre-check in
  forge_publish.py that fails at once with no token and no injected one.
