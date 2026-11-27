---
id: 309
title: "The bible did not say where DFO's source lives; a port needed list_repos to find it"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["bible/04-Procedures/Porting from DFO.md"]
siblings_checked: "checked: Port.md, Pick List.md, Hand-off.md named website.df.source and overlook-source, not dfo-online-source"
area: "porting from DFO"
date: 2026-11-26
session_context: "Owner asked to import DFO's ship lantern function; the procedure named no repository. Found Lattymoy/dfo-online-source by list_repos, attached and cloned shallow (06b2b991). Added one line to the procedure on this branch."
parked_until:
resolved:
resolution:
reference: "branch ccr-2431af4f-9zbz03, 02b6426f"
commands_verified: "list_repos query df; git clone --depth 1"
---
