---
type: reference
source: DFO Online, branch ccr-aff93cb4-gw1nto-audit plus infra-to-server, pve-fixed-levels and the ship refit
---
# Pick List

Everything DFO Online holds, on `main` and its unmerged branches, sorted by what can come over and how. Read it with
[[Port]], which explains the verdicts and the "Lands as" column. Whether a system belongs in Overlook is the owner's
call; this list only says what can come.

| Part | Rows | Clean | Cut | Can't |
|---|---|---|---|---|
| [[Pick List - Engine and World]] | 127 | 31 | 72 | 24 |
| [[Pick List - Gameplay Systems]] | 130 | 20 | 69 | 41 |
| [[Pick List - Network and Platform]] | 85 | 27 | 55 | 3 |
| [[Pick List - Presentation and Tooling]] | 126 | 28 | 68 | 30 |
| **All** | **468** | **106** | **264** | **98** |

The owner's own project-final is sorted the same way in [[Pick List - project-final]].

## The seams that decide most rows

Most "Cut" rows are ours apart from one of these. Replacing each once frees many rows at a time.

| Seam | Where it reaches in DFO | What replaces it | Decided |
|---|---|---|---|
| Daggerfall's texture key (`archive_record`) and palette snap | Every material, tile array and sprite batch; our own art filed under made-up archive numbers | Our own asset and material IDs | [[Our Own Keys for Materials, Places and Items]] |
| Place identity: map ID, building key, map pixel | The wire, the relay, homes, halls, raids and 64 of 215 migrations | Stable place IDs of our own | [[Our Own Keys for Materials, Places and Items]] |
| Daggerfall Unity's item templates and enchantments | 100 systems files; the account service judges every item by them | Our own item table | [[Our Own Keys for Materials, Places and Items]] |
| Daggerfall Unity's stats, skills, races and armour | 124 systems files | Our own stat and skill model | [[Our Own Keys for Materials, Places and Items]] |
| Bestiary, calendar, map grid, text system | Enemy and townsfolk tables (90 files), `gameDate`, `mapsFile`, `textManager` (181 files) | Our own tables | [[Our Own Keys for Materials, Places and Items]] |
| Daggerfall-shaped world data | Capitals, World 2.0 towns and places past the Bay all become Daggerfall map and block records; the terrain sampler is Daggerfall Unity's | Our own world grid, scene format and terrain sampler over World 2.0's bakes | [[World 2.0 Feeds the World Map]] |
| The quest machine | Daggerfall Unity's, translated line for line (about 17,000 lines); our quests are written in its script language | A new quest system, DFU's as reference | [[Quests Are Rebuilt, DFU's as Reference]] |
| Ships inside Come Sail Away's structure | Every hull, ours and the owner's, wrapped in the mod's prefabs; the sailing runtime is a port of the mod | Our own ship format and sailing runtime | [[Naval, Living World, Professions and Synth Come Over Leaner]] |
| Combat rules | Damage, weapons and enemy movement are Daggerfall Unity translations or mod ports | Rust combat from our own rules; DFO's duels, PvP and techniques are the original parts | Not yet |
| Other authors' work | Mod ports (Come Sail Away, Horse Cart and Cargo, Snowfall, the sea and underwater from Iliac Puddle No More, mod settings) and the mods made for DFO | Our own systems ([[Own Work]]); the Arena, Raiding Parties and Warm Ashes come over rebuilt | [[Which Made-for-DFO Mods Come Over]] |

## The best Clean pieces

- **Engine and world**: World 2.0's generators (field, grid, exact maths, drainage, erosion, hydrology, rivers, soil,
  biomes, vegetation, resources, stages, tiling, the editor), which a Rust reader can match bit for bit; our own hull
  builders; the terrain workers and far-distance rings.
- **Gameplay**: the naval combat core (16 files, its AI alone 2,220 lines), the living-world simulation core, the
  profession and gathering acts, our synthesiser and its written scores, soundscape, party rules, the loot level gate.
- **Network and platform**: the trust chain (signed identity tokens, signed orders, one-use receipts); the world-cell
  tree that splits and merges; the sharded hub and its bus; the overload and reconnect handling.
- **Presentation and tooling**: the forge's core (body, rig, skinning, depth layers, render cache, bulk rendering,
  clip check); the player collider; the HUD, touch and menu helpers; the changed-tests and test-sharding runners.

## Unmerged work

- **`infra-to-server`** (734 commits): the closest DFO came to server authority, with a fixed 20-step-a-second server,
  movement checked by replaying the player's inputs, levels built on the server and a server-side home per character,
  run off Cloudflare and measured. Its design is the reference for Overlook's server; its code runs DFO's client and
  Daggerfall Unity rules, so it stays ([[The Server Gets Its Own Rules]]).
- **`pve-fixed-levels`**: the raid roster, on Daggerfall's regions and bestiary.
- **The ship refit and seabed branch**: inside Come Sail Away's structure.
- **The forge's work-in-progress branches**: more looks, hair, weapons and animation on the same core.
- **`wip/remove-guns`**: DFO's guns turned to crossbows; the gun code before it is in the presentation part.

Each part's own "Unmerged work in this area" section has the detail.
