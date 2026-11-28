---
id: 273
title: "A presence probe's walker died in its first 20 s and was carried dead across the zone, then (respawning) strayed out of the section unseen, so the probe misreported both trees twice"
status: actioned
type: open-source
skill: []
proposes_skill: []
target_file: ["bible/03-Code/Testing.md"]
siblings_checked: "checked open titles naming 'probe', 'measur' and 'instrument': 0029 covers an ignored measurement test's bound never running, 0058 real baked nodes; neither covers a simulated actor whose state invalidates the measure. Instance-general, no propagation"
area: "ad hoc measurement tests over the real baked nodes (a scratch test like crates/room/tests/zz_presence_probe.rs)"
date: 2026-11-25
session_context: "Foe arrivals branch: a scratch test walked a player across each real patrol zone with put_player and counted foes within 80 m. It said 'ships at once 0' after two rule changes. A trace of the room showed 'roaming 0' at every sample; a second trace of the player showed health 0 from tick 1,200. The garrison at the landing killed the walker, which never fought or healed, and put_player moved the corpse on. The rules rightly send nothing to a dead player. The main baseline numbers came from the same dead walker, so they were wrong too."
parked_until: "PR #244 merge"
resolved: 2026-11-27
resolution: "review 2026-11-27: applied in PR #244, merged 2026-11-27"
reference: "crates/room/src/reinforcements.rs roaming(); crates/room/src/course.rs put_player (moves a fallen player too)"
commands_verified: "run: cargo test --release -p room --test zz_presence_probe -- --ignored --nocapture with an eprintln of each player's living/health every 300 ticks -> living false from t1200 to the end"
---

**Second instance, same probe:** fixed to respawn its walker and count only living seconds by `fighter.dead()`, it still read one airship where four or five were due. A trace showed `roaming()` empty from tick 4,800: the walk (1.4 times the way to the ring's vertex average) left a concave section, and the section killed the walker by straying (`Standing::Dead`), which `fighter.dead()` does not show. The rules' own `Player::living()` checks both. Fixed by walking the node's resources in order (inside the section) and reading the same two states the rules read.

**Issue:** A measurement drove a simulated actor (a player put along a path each second) and read an outcome that depends on the actor's state (foes sent to a living, roaming player). It never checked that state, so the actor's death in the first 20 s turned every reading after it into a reading of a corpse. A null result ("no airship ever came") was taken as a rules defect, and two rule changes were tried before the instrument was checked.

**Suggested improvement:** A probe that drives an actor reads the actor's state by the same test the code under measure uses (here `Player::living()`'s two conditions, not one of them), walks it along a path the content itself gives (a node's resources, ways), and asserts or reports that state beside each reading (alive, where it is, whether the input was taken), and counts readings only while that state holds. Before changing the code under a null result from a probe, trace the probe's actor first.

**Principle:** Validate the instrument before trusting its null result: a measuring script's actor must be shown alive and where it was put, or its readings measure the script.
