---
id: 0298
title: "A worker stopping its preview servers by a command-line match killed a sibling worker's claude process"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md"]
siblings_checked: "checked: the template says stop by pid, never pkill -f; it does not say a pid list built from ps | grep on a port or path is the same mistake"
area: "workers running side by side"
date: 2026-11-26
session_context: "hub-ground stopped its vite preview servers with a pid filter on the command line; the ship-stern worker's claude process held the port numbers in its own command line and got SIGTERM (WORKER ship-stern EXIT 143, uncommitted work); run-worker.sh resumed it once to commit."
parked_until:
resolved:
resolution:
reference: "session 01AQ3N4ngdqNdXFFNT7JJmBM, ~/wt/reports/hub-ground.log, ship-stern.log"
commands_verified: "tail ship-stern.log: run, showed EXIT 143 then the resume line"
---
Proposed: the template tells a worker to keep the pid of each server it starts ($! after a background start) and stop
only those, never a pid found by matching a command line.
