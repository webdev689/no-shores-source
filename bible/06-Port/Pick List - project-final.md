---
type: reference
source: project-final, commit b0ac719 on main (a one-commit shallow clone)
---
# Pick List - project-final

project-final is "Voxlight", the owner's first-person combat game built off vanilla Destiny 1: plain JavaScript on
Vite, the world on WebGL2, characters, guns and enemies on a CPU rasteriser, the HUD on Canvas 2D, and no networking.
It holds 941 files: `src/` (166 files, 28k lines), `rewrite/`, `tools/` (114), `test/` (90, about 800 cases) and a
49-note bible. The Stargrim fonts and bakes, the Raum lore, project-dagger's body and the music are the owner's own;
Daggerfall's item table and Daggerfall Unity code in `src/game/dagger/`, a gun model made by someone else, and audio
samples with no per-file licence are not. Read it with [[Port]] for the verdicts,
[[Overlook Is a Shared World After Destiny 1]] for the scope, and [[Pick List]] for DFO's side.

Scope: every file on `main` at `b0ac719`. Rows come from file headers, import lists and name searches. Section sizes
are `wc -l` lines for code and notes, and bytes for maps, public and art. The tests were not run. **Cut** with "Destiny's
names" means the logic is ours, but the code or note uses Destiny's or another game's names and terms (engram,
Warlock, Titan, strike, Halo, Doom): the logic comes, the names stay. Whether a system belongs in Overlook is the
owner's call; this list only says what can come.

| Area | Rows | Clean | Cut | Can't |
|---|---|---|---|---|
| Root, engine and rewrite | 11 | 10 | 1 | 0 |
| src/game | 47 | 22 | 22 | 3 |
| src/ui and editors | 6 | 4 | 2 | 0 |
| tools/ and test/ | 18 | 10 | 8 | 0 |
| maps, public and art | 11 | 7 | 3 | 1 |
| bible/ | 15 | 4 | 10 | 1 |
| **All** | **108** | **57** | **46** | **5** |

## Where it meets the new scope

- **Power, gear, drops and XP**: `gearInstances.js` (Prestige per item; the equipped average is the power figure),
  `loot.js, lootHost.js` (drops by tier, weapon XP on each kill), `perkEffects.js`, and `03-Gear/`. There is no
  player XP or level; enemy levels are placeholders.
- **Node upgrades and dismantling**: `gearInstances.js` gives each weapon five nodes (Sight, Prestige I, Perk A,
  Prestige II, Perk B), costed in Bits and Scraps, with Scraps only from dismantling and a weapon-XP gate. Armour has
  no nodes. `gridUI.js` and `hubUI.js` show them. There are no rare or legendary resources.
- **Weapon types**: `weaponRegistry.js` (six ranged types, twelve frames) and `Arsenal-Spec`. There are no melee
  weapon types; the player's only melee is the Sever relic.
- **Missions and encounters**: `mission.js`, `encounter.js, encounterSynth.js`, `mapSynth*`, `blockSynth.js`,
  `campaign.js`, the `into-the-deep` map and its note. A map is chosen by URL; there is no mission select.
- **Bosses**: `boss.js` (the Heart), `wardenBoss.js` and `bossBar.js`. Their attacks are telegraphed and avoided by
  moving; the player has no lock-on, dodge move or parry.
- **Enemies**: five crystal-faction archetypes, behaviour trees, attack tokens, the director and the navmesh.
- **UI screens**: the HUD in `src/ui/`, the character hub, item inspect, talent grid, character select, title and
  loading screens.
- **Islands and sea**: `terrainWorld.js`, `water.js` and the Laos Atoll map: one heightfield island in a sea, with
  swimming and drowning, and boats as scenery.
- **Nothing for**: ships, sailing and naval combat; crew; the social hub, other players and any networking
  (`Multiplayer.md` is design only); shops, factions to join and quests; player XP; rare or legendary resources;
  lock-on and parry; melee weapon types; continents, landing by distance, the bird's-eye view and travel to a
  chosen mission.

## The list

| Folder / module | What it is (<=12 words) | Kind | Verdict | Lands as | Seam or reason (<=25 words) | Effort | Evidence |
|---|---|---|---|---|---|---|---|
| **Root files (8 files, 1.4k lines)** | | | | | | | |
| `index.html` | The one page: game canvas, HUD canvas, panels, tune sliders | Platform | Clean | TS port | Ours. Loads `src/main.js` and the two hub gesture modules; `?tune` opens an inline slider panel. | S | index.html |
| `src/main.js` | Entry and frame loop: look, move, fire, loot, render, wiring | Gameplay | Cut | TS port (client loop) + Rust rebuild (the rules it calls) | One closure at its line ceiling; a comment on its loot array names Destiny's engrams. Carry the wiring order, not the file. | L | src/main.js:239 |
| `vite.config.js, package.json, package-lock.json, .gitignore, .github/workflows/deploy.yml, render_util.mjs` | Build, lab page entries, test script, Pages deploy, offscreen render shim | Platform | Clean | Practice | Vite plus `node --test`. CI checks sample loudness, tests, builds and deploys to GitHub Pages. | S | vite.config.js |
| **src/engine (11 files, 580 lines)** | | | | | | | |
| `src/engine/audio.js` | Web Audio engine: master bus, category buses, unlock, sample loading | Engine | Clean | TS port | Ours and seam-free. Procedural voices plug in through an injected synth hook. | S | src/engine/audio.js |
| `math, geometry, palette, gpuWorld, renderer, billboards, spriteFrame, rng, pixelScale` + `src/game/limb.js` | One-line re-exports of `rewrite/`; the master pixel scale | Engine | Clean | TS port (pixelScale) | The shims carry no code. pixelScale is the world size of one sprite texel, which every bake derives from. | S | src/engine/pixelScale.js |
| **rewrite/ (15 files, 3.4k lines)** | | | | | | | |
| `rewrite/core/math.js, geometry.js, palette.js, rng.js` | Vector maths, voxel face primitives, banded shading, the shared seeded RNG | Engine | Clean | TS port | Pure and seam-free. The face shape `{p, n, c}` is the contract every builder in the game shares. | S | rewrite/core/geometry.js |
| `rewrite/render/renderer.js` | CPU software rasteriser and perspective first-person camera | Engine | Clean | WebGPU rewrite | Characters, guns and enemies draw here, on the CPU, into a low-resolution buffer. | M | rewrite/render/renderer.js |
| `rewrite/render/gpuWorld.js, shaders.js` | WebGL2 world: low-resolution target, bake modes, water, sky, composite | Engine | Clean | WebGPU rewrite | Composites the CPU character buffer over the world with occlusion on the GPU. GLSL strings become WGSL. | L | rewrite/render/gpuWorld.js |
| `rewrite/render/billboards.js, spriteFrame.js` | Camera-facing sprites: loot, ammo, bolts, rockets, smoke, splashes | Engine | Clean | WebGPU rewrite (spriteFrame: TS port) | Ours. spriteFrame maps an action's phase to a frame and is pure. | M | rewrite/render/billboards.js |
| `rewrite/rig/body.js, bodySpec.js, poseTables.js` | Humanoid rig: gait, holds, crouch, slide, mantle, jump, content sockets | Engine | Clean | TS port | Deterministic; a 78-case parity fixture pins its faces. Proportions are data, content plugs in at named sockets. | L | rewrite/rig/body.js |
| `rewrite/rig/limb.js, muzzleFlash.js, README.md` | Two-bone IK for every limb; muzzle-flash faces; the engine's surface | Engine | Clean | TS port | Seam-free. The README sets out how a game wraps the shared base with its own plugs. | S | rewrite/rig/limb.js |
| **src/game: gear, loot and perks (9 files, 950 lines)** | | | | | | | |
| `gearInstances.js` | Gear instances: tier, Prestige, talent-grid nodes, Bits, Scraps, dismantling | Gameplay | Cut | Rust rebuild | Our power and upgrade model; tier names and perk pools are ours. A comment names Destiny 1's perk toggle. | M | src/game/gearInstances.js:36 |
| `perkEffects.js` | Active perks turned into fire, handling and movement modifiers | Gameplay | Clean | Rust rebuild | A pure snapshot of multipliers per equipped instance, plus the on-hit and on-kill hooks. | S | src/game/perkEffects.js |
| `loot.js, lootHost.js` | Loot crystal in five tiers; drop rolls, pickup, weapon XP on kill | Gameplay | Cut | Rust rebuild (rolls, XP) + TS port (crystal, drop arc) | Ours. The drop arc is called engram physics in code, Destiny's term. | M | src/game/lootHost.js |
| `ammo.js, chestProp.js` | Ammo brick and cache chest geometry, baked to sprites | Content | Clean | TS port | Our face builders; the chest is parameterised by lid angle for its opening frames. | S | src/game/chestProp.js |
| `relic.js, relicViewmodel.js, relicAudio.js` | Relic ability: meter from kills, the Sever twin-dagger melee window | Gameplay | Cut | Rust rebuild (meter, damage) + TS port (viewmodel) | Our registry. Code names the activate-at-full rule after Destiny's super. Cues play `public/audio/relic` samples. | M | src/game/relic.js:38 |
| **src/game: weapons and combat (11 files, 981 lines)** | | | | | | | |
| `weaponRegistry.js` | Six weapon types, twelve frames: fire, ammo, damage, crit, handling | Gameplay | Clean | Rust rebuild | Frame names (Warden, Talon, Sunder) are ours. Ranged types only; no melee weight or speed. | M | src/game/weaponRegistry.js:89 |
| `hitscan.js, aimAssist.js` | Player hitscan against colliders and hit-boxes; gamepad aim assist | Gameplay | Clean | Rust rebuild (hit) + TS port (assist) | Pure and tested. Aim assist changes pad look only, never the mouse. | S | src/game/hitscan.js |
| `playerProjectiles.js, rocketHost.js, beamHost.js` | Rocket with area blast; charged piercing beam | Gameplay | Clean | Rust rebuild | Pure host sims over plain data; the two hosts are thin glue to the world. | S | src/game/playerProjectiles.js |
| `playerBolt.js, playerSmoke.js` | Cosmetic energy bolts, hit splashes and rocket smoke | Engine | Clean | TS port; their draw is a WebGPU rewrite | Visual only; the hit is resolved by hitscan. | S | src/game/playerBolt.js |
| `attachments.js, weaponPoses.js, boreAnchor.js` | Scope pool, per-weapon pose deltas, hold position derived from muzzle | Gameplay | Cut | TS port | Ours. The magnified scope is called the Halo battle-rifle scope in code. | S | src/game/attachments.js:105 |
| **src/game: viewmodels and first-person guns (16 files, 3.3k lines)** | | | | | | | |
| `viewmodel.js, reloadRoutines.js, bfgReload.js, legs.js` | First-person hands and guns; reload motions; legs with foot planting | Engine | Cut | TS port; drawing is a WebGPU rewrite | Our builders on the CPU rasteriser. A comment calls the revolver a Destiny-style hand cannon. | L | src/game/reloadRoutines.js |
| `pistol.js, handCannon.js, sarViewmodel.js, sniperViewmodel.js, launcherViewmodel.js, lmg2.js` | Gun models: pistol, revolver, marksman, sniper, launcher, belt-fed machine gun | Content | Cut | TS port | Our geometry. handCannon names Destiny's guns (Ace of Spades, Eyasluna) as its model. | M | src/game/handCannon.js |
| `bfgViewmodel.js, meshes/bfglike.js` | The Requiem: an imported Blender gun mesh, textured in code | Content | Can't | — | The mesh was modelled by someone other than the owner; no licence is recorded. Ours inside: the texturing and the beam frame. | — | src/game/meshes/bfglike.js |
| `fpViewmodel.js, fpgunBake.js, fpgunSprite.js, fpgunSheet.js` | Gun drawn as a baked sprite strip or a painted sheet | Engine | Cut | WebGPU rewrite | Our bake through the live lens. Comments measure it against Doom. The sheet path expects a generated image. | M | src/game/fpgunBake.js |
| **src/game: body, armour and outfits (9 files, 1.3k lines)** | | | | | | | |
| `body.js, armorKit.js, armorOutfit1.js, armorOutfit3.js, armorOutfit4.js, armorOutfit6.js` | Our body plugs; plate, jumpsuit, blast-suit and light combat outfits | Content | Clean | TS port | Pure geometry on the rig's solved joints, third- and first-person. | M | src/game/armorOutfit4.js |
| `armor.js, armorOutfit2.js, armorOutfit5.js` | Outfit registry and shaders; robed and heavy plate outfits | Content | Cut | TS port | Destiny's names: the builders are `buildWarlock*` and `buildTitan*`. The shapes and registry are ours. | M | src/game/armor.js |
| **src/game: enemies, AI and navmesh (16 files, 5.2k lines)**: approved in part, [[Pick - project-final AI]] | | | | | | | |
| `enemy.js, enemyShared.js` (**approved: perception**) | Enemy entity: rig body, hit-boxes, sight and hearing, alert spread | Gameplay | Cut | Rust rebuild | Our perception rules. Comments cite Destiny 1's spotting and a Destiny-style level box. | L | src/game/enemy.js |
| `behaviorTree.js, enemyMelee.js, enemyRanged.js` (**approved: cover and flanking**) | Behaviour-tree kit; melee and ranged archetype trees, cover, flanking | Gameplay | Clean | Rust rebuild | Pure, seam-free and tested. The enemy's dodge windows are telegraphs the player reads. | M | src/game/behaviorTree.js |
| `aiTokens.js, firingPositions.js` (**approved: firingPositions**) | Cap on simultaneous attackers; cover and firing positions baked from navmesh | Gameplay | Cut | Rust rebuild | Ours. Comments name Halo and Bungie as the source of both ideas. | S | src/game/aiTokens.js:1 |
| `navmesh.js` (**approved: the ground heightfield**) | In-house navmesh: voxelise, regions, polygons, paths, obstacles, index | Gameplay | Clean | Rust rebuild | Written from scratch, Recast and Detour in spirit. Byte-level goldens pin it. One entry point: findPath. | L | src/game/navmesh.js |
| `husk.js, bulwark.js, flicker.js, idol.js, ravager.js, spriteAction.js` (**drawn anew in the forge**, [[Lattice]]) | Five crystal-faction enemy bodies; sprite action picker | Content | Clean | TS port | Our designs on the Raum lore's Cube crystal. Geometry layered on the shared rig; their rules are in the AI rows. | M | src/game/husk.js |
| `enemyFx.js, crystalDeath.js` | Enemy projectiles, crystal pools, muzzle bursts, shatter death | Gameplay | Clean | Rust rebuild (projectiles, pools) + TS port (effects) | A pure host sim from plain data. | S | src/game/enemyFx.js |
| **src/game: encounters, missions and director (8 files, 746 lines)** | | | | | | | |
| `encounter.js, encounterSynth.js` | Encounter runtime; seeded wave synthesis from the map's geometry | Gameplay | Clean | Rust rebuild | Plain serialisable state and a pure host tick. Waves are placed by reading the world, not by coordinates. | M | src/game/encounterSynth.js |
| `mission.js, interactable.js, hum.js` | Mission step machine; one-use interact points; the depth drone | Gameplay | Cut | Rust rebuild (mission, interact) + TS port (hum) | Ours and pure. Comments call the mission a strike, Destiny's term. | S | src/game/mission.js |
| `director.js` (**approved**) | Combat director: one intensity meter that paces the fight | Gameplay | Cut | Rust rebuild | Ours. A comment names Halo as the idea's source. | S | src/game/director.js:2 |
| `campaign.js, gate.js` | Map loader and boot choice; holographic lock gates | Gameplay | Clean | Rust rebuild (loader, gates) + TS port (gate look) | Ours. campaign loads the bowl, a synthesised dive or a block grid from the URL. | S | src/game/campaign.js |
| **src/game: bosses (2 files, 1.2k lines)** | | | | | | | |
| `boss.js` (**not taken**, [[The Heart Is the Port's People Fused Into One Giant]]) | The Heart: floating crystal boss, three health bars, crawl, finale | Gameplay | Clean | Rust rebuild (rules) + TS port (mass) | Ours: a host-authoritative sim with telegraphed attacks. No lock-on, dodge or parry for the player. | L | src/game/boss.js |
| `wardenBoss.js` | Warden of the Deep: shielded mortar boss broken by podium order | Gameplay | Cut | Rust rebuild | Ours, shaped like the Heart's sim. Comments call it a strike boss. | M | src/game/wardenBoss.js:1 |
| **src/game: world, maps, water and terrain (14 files, 3.3k lines)** | | | | | | | |
| `mapSynth.js, mapSynthEpic.js, mapSynthOneShot.js, mapSynthSecondPass.js, mapSynthSecondPassFinalize.js` | Whole maps from a room library, a recipe and a seed | Gameplay | Cut | Rust rebuild | Our assembler, after Stargrim's. Seeds are share codes. Comments call the mission a strike. | L | src/game/mapSynth.js |
| `blockSynth.js, blockLibrary.js` | Block-grid dungeons: fixed cells, edge masks, loops, sealed boss cell | Gameplay | Cut | Rust rebuild | Our generator; it reads no Daggerfall data. Its seven laws are Daggerfall's dungeon block model. | M | src/game/blockSynth.js:3 |
| `arena.js, arenaSecondPass.js, terrain.js` | Greybox combat bowl, map-to-arena builder, walkable surface model | Gameplay | Clean | Rust rebuild (colliders) + TS port (faces) | Pure. One surface model feeds the mover, the bullet and sight raycasts and the navmesh. | M | src/game/terrain.js |
| `terrainWorld.js, water.js` | Heightfield island with sea, palms, boats; swim, wade and drown | Gameplay | Clean | Rust rebuild (water state) + TS port (terrain mesh) | Ours. Loads the Laos Atoll map. The boats are scenery. | M | src/game/terrainWorld.js |
| `flora.js, worldMat.js` | Voxel grass, ferns, crystals; rock cladding over greybox | Engine | Clean | TS port; their draw is a WebGPU rewrite | Visual only, seeded and deterministic. | M | src/game/worldMat.js |
| **src/game/dagger (14 files, 7.7k lines)** | | | | | | | |
| `neutralBody.js, armLoft.js, legLoft.js, paperRig.js, gait.js, pieceLoft.js` | project-dagger's body, its limbs lofted along the live rig, gait | Content | Clean | TS port | project-dagger's own code; neutralBody is vendored verbatim. No ARENA2 data. This is the body the game draws. | M | src/game/dagger/paperRig.js |
| `skinKit.js, outfitZones.js` | Pixel kit of material marks; our outfits as displace zones | Content | Clean | TS port | Ours. Marks resolve to materials, so they stay lit and on the palette. | S | src/game/dagger/skinKit.js |
| `itemTemplates.json, clothing.js, armorSet.js, paperdollArt.js` | Daggerfall's item table; clothing and armour zones keyed to it | Gameplay | Can't | — | itemTemplates.json is Daggerfall's template table; paperdollArt is verbatim Daggerfall Unity. Only tools/body-view.js reads them; the game does not. | — | src/game/dagger/clothing.js:13 |
| `dyes.js` | Dye and material tint tables | Engine | Can't | — | 1:1 from Daggerfall Unity's ImageProcessing. Nothing imports it. | — | src/game/dagger/dyes.js:2 |
| `palettes.js` | Skin, fur and hide colour ramps per race | Content | Cut | TS port | Keyed by Elder Scrolls races (Khajiit, Argonian, elves). Nothing imports it. | S | src/game/dagger/palettes.js |
| **src/game: player, camera, input and boot (12 files, 2.4k lines)** | | | | | | | |
| `input.js, bootPad.js, haptics.js` | Keyboard, mouse and gamepad merged into one state; rumble | Platform | Cut | TS port | Ours. A comment lays out the pad by Destiny's controller buttons. | S | src/game/input.js:31 |
| `settings.js` | Settings store: one schema-checked localStorage blob | Platform | Clean | TS port | Clamps ranges and drops unknown keys, so a stale blob cannot break a load. | S | src/game/settings.js |
| `titleCinematic.js, loadingScreen.js, bootFade.js` | Boot title cinematic, loading spinner, overlay fades | UI | Clean | WebGPU rewrite | Canvas 2D over the First Light sky. The title reads VESTIGE and VOXLIGHT, both the owner's. | M | src/game/titleCinematic.js |
| `charSelect.js, loadout.js, equipUI.js, uiTheme.js` | Character select, starting loadout, placeholder equip overlay, menu theme | UI | Clean | TS port + WebGPU rewrite (the canvas sky) | DOM plus a Canvas 2D sky. A loadout is one Light weapon, one Heavy weapon and one outfit. | S | src/game/loadout.js |
| `devHooks.js` | The `window.__*` debug console carved out of the entry | Tooling | Cut | TS port | Dev only. A comment calls the loot drop an engram. | S | src/game/devHooks.js |
| **src/game: hub and item screens (8 files, 1.8k lines)** | | | | | | | |
| `hubUI.js, hubEnhancements.js, hubGestures.js, hubMagnetGestures.js` | Character hub: weapon and armour slots, wallet, gestures, dismantle | UI | Cut | TS port | A DOM screen called Destiny-shaped in code. Shift and right-click dismantles an item into Scraps. | M | src/game/hubUI.js:2 |
| `gridUI.js, inspectUI.js, inspectStats.js, gearRender.js` | Talent-grid view, item inspect, stat bars, gear icon painter | UI | Cut | TS port; gearRender's painter is a WebGPU rewrite | Ours on real gear data. Comments name Destiny's icon pose, perk toggle and Lightweight Frame. | M | src/game/gridUI.js |
| **src/game: audio (13 files, 1.5k lines)** | | | | | | | |
| `synth.js, music.js` | Procedural voices; three-track music director with crossfades | Engine | Cut | TS port | Ours; the tracks are the owner's. A comment names Destiny's reveal chime. | M | src/game/synth.js:380 |
| `enemyAudio, audioConfig, footsteps, jumpAudio, landAudio, mantleAudio, slideAudio, swapAudio, reloadAudio, hitmarkerAudio, impacts` | Sampled cues: enemies, gunfire, foley, reloads, hit marker, impacts | Engine | Cut | TS port | Our playback and mix. The samples are `public/audio`, which has no per-file licence list. | M | src/game/reloadAudio.js |
| **src/ui (22 files, 1.9k lines)** | | | | | | | |
| `hud.js, hudLayout.js, hudText.js, vitals.js, reticle.js, damageNumbers.js` | HUD frame, layout, text, vitals, reticle and scope, damage numbers | UI | Cut | WebGPU rewrite | Canvas 2D, drawn from a per-frame snapshot. The reticle's scope is named after Halo's battle rifle. | M | src/ui/hud.js |
| `radar.js, objective.js, nameplate.js, banner.js, damageIndicator.js, enemyHealthBars.js, lootToast.js, weaponSlot.js` | Radar, objective card, place banner, hit arcs, enemy bars, loot toast | UI | Cut | WebGPU rewrite | Canvas 2D. Each is described in code as Destiny's own HUD piece. | M | src/ui/radar.js |
| `bossBar.js, bossDreadVignette.js, relicMeter.js` | Boss health bar, dread vignette, relic charge meter | UI | Clean | WebGPU rewrite | Canvas 2D, pure drawers. | S | src/ui/bossBar.js |
| `pixelText.js, headerFont.js, titleFont.js` | Stargrim pixel fonts: body, header and title faces | UI | Clean | TS port + WebGPU rewrite | The owner's fonts, as glyph grids. The glyph data ports as it is; the drawing is Canvas 2D. | S | src/ui/pixelText.js |
| `hudTuner.js, moveTuner.js` | Slider panels for the HUD, render and movement feel | Tooling | Clean | TS port | Dev panels opened by a gear button or a URL flag. | S | src/ui/hudTuner.js |
| **editors/ (2 files, 329 lines)** | | | | | | | |
| `editors/map-editor.html, map-editor.js` | Top-down map editor: zones, spawns, encounters, generate | Tooling | Clean | TS port | Ours. Edits the map JSON that `campaign.js` loads; GENERATE runs the plain room assembler. | M | editors/map-editor.js |
| **tools/ (114 files, 19.0k lines)** | | | | | | | |
| `tools/_tuner-kit.js, _tuner-kit.css` | Shared slider panel for every lab | Tooling | Clean | TS port | Themed sections and a copy-out of tuned values. | S | tools/_tuner-kit.js |
| `tools/{husk,flicker,idol,ravager,heart,lob-pool}-tuner, bulwark-*` (.js, .html) | Live tuners for each enemy's body, animation and attacks | Tooling | Clean | Practice | Pages that draw the real rig through the CPU rasteriser. The habit carries; the pages are tied to that renderer. | M | tools/husk-tuner.js |
| `tools/{body-anim,body-tuner,body-view,boxer-lab,armor-lab,legs-tuner,tp-cam,sever-cam,paper-lab}` | Third-person body, armour, legs and camera labs | Tooling | Cut | Practice | body-view reads Daggerfall's item table through clothing.js. armor-lab and body-anim name Destiny's classes; paper-lab names Paper Mario. | M | tools/body-view.js |
| `tools/{fps-hands,vm-lab,reload-lab,sprint-lab,aim-lab,scale-lab,relic-lab}`, `{flash,bolt,splash,smoke,enemy-bolt,lob,lob-trail,crystal,loot}-lab` | Viewmodel, reload, aim, scale and effect tuners | Tooling | Cut | Practice | Seam-free apart from names: loot-lab calls the drop an engram. | M | tools/vm-lab.js |
| `tools/{gpu-world,gpu-hybrid,render-split,dither-lab,outline-lab}` | Hybrid renderer prototypes; dither and outline passes | Tooling | Clean | Practice | Prototypes of what `rewrite/render` does; WebGL2 and the CPU rasteriser. | S | tools/gpu-hybrid.js |
| `tools/*-spritebake.mjs, spritebake.mjs, gun-silhouette-bake.mjs` | Offline bakes of real geometry to billboard sprite sheets | Tooling | Cut | TS port | Ours; they write `public/sprites`. Comments name Destiny and Paper Mario. | M | tools/spritebake.mjs |
| `tools/fpgun-*.mjs, frame-look.mjs` | Bake, compare and preview the first-person gun sprites | Tooling | Cut | Practice | Ours; fpgun-check boots the build headless. Comments name Doom. | S | tools/fpgun-spritebake.mjs |
| `tools/fbx-dump.mjs, fbx2faces.mjs, bfg-import.mjs, bfg-look.mjs` | Binary FBX reader; Blender mesh to face-list import | Tooling | Clean | TS port | Our reader. Its only input is the Requiem model made by someone else (Can't). | S | tools/fbx2faces.mjs |
| `tools/audio-lab, synth-lab, music-probe.mjs, normalize-audio.sh` | Sample audition, procedural synth lab, music probe, loudness check | Tooling | Cut | Practice | Ours. audio-lab auditions Freesound candidates that carry no per-file licence. | M | tools/audio-lab.js |
| `tools/{hud-lab,ui-hub,menu-lab,title-lab,loading-lab,move-tuner}` | HUD, hub, menu, title and loading prototypes | Tooling | Cut | Practice | Prototypes of the screens in `src/`. hud-lab, ui-hub, menu-lab and loading-lab name Destiny. | M | tools/ui-hub.js |
| `tools/ai-probe.mjs, inspect-probe.mjs, playtest.mjs, bake-nav.mjs, _wc.mjs` | Headless AI and inspect probes, playtest, navmesh bake, line count | Tooling | Clean | Practice | Playwright on the real build. bake-nav attaches a precomputed navmesh to a map. | S | tools/ai-probe.mjs |
| `tools/build-laos-atoll.mjs` | Compiles the Laos Atoll island map from region art | Tooling | Clean | Content rebuild | The owner's Raum region. A parametric compiler for island, reef and sea. | M | tools/build-laos-atoll.mjs |
| **test/ (90 files, 11.1k lines)** | | | | | | | |
| `test/game/{nav*,enemy*,ai*,behaviorTree,director,firingPositions,idolPerch}.test.js` | AI, navmesh and enemy tests, with byte-level goldens | Tooling | Clean | Rust rebuild | The specification for Rust AI and pathing tests. | M | test/game/navGolden.test.js |
| `test/game/{mapSynth*,blockSynth,encounter*,mission,campaign*,deepMap,gate,interactable,...}.test.js` | Map synthesis, encounter, mission and world invariants | Tooling | Cut | Rust rebuild | Seeded invariant tests. Their headers call the mission a strike. | M | test/game/mapSynth.test.js |
| `test/game/{gearInstances,perkEffects,lootHost,weaponRegistry,hitscan,relic,boss,warden*,...}.test.js`, `test/{beam,inspectStats,loadout,gearRender}.test.js` | Gear, loot, weapon, relic and boss rule tests | Tooling | Cut | Rust rebuild | The specification for Rust rule tests. Some name Destiny 1 or the strike. | M | test/game/gearInstances.test.js |
| `test/game/{body,bodyParity,animation,limbSeams,paperHands,trunkAndFoot,skinKit,...}.test.js`, `test/fixtures/` | Rig, body, limb seam and palette tests; the parity fixture | Tooling | Clean | TS port | Pins the rig's face output, 78 cases. | S | test/fixtures/body-parity.json |
| `test/engine/*`, audio tests, `test/{fpgun-*,fpviewmodel,bfg,settings,input-binds}.test.js` | Engine maths, GPU upload, audio cues, gun sprites, settings, bindings | Tooling | Clean | TS port | Pure tests. bfg.test.js tests the Requiem, which stays. | S | test/engine/gpuUpload.test.js |
| `test/structure.test.js, manifest.js, manifest.test.js, devhooks-surface.test.js` | File ceilings, import cycles; content manifest checked against code and bible | Tooling | Clean | Practice | The manifest pins weapons and enemy roles to the code and the docs. | S | test/manifest.test.js |
| **maps/ (2 files, 964 KB)** | | | | | | | |
| `maps/into-the-deep.json` | The first mission's hand-made map: blocks, zones, spawns | Content | Clean | Content rebuild | Our map, in project-final's map JSON. | S | maps/into-the-deep.json |
| `maps/laos-atoll.json` | Laos Atoll: island heightfield, paint, sea and boats (978 KB) | Content | Clean | Content rebuild | The owner's Raum region, compiled by tools/build-laos-atoll.mjs. | M | maps/laos-atoll.json |
| **public/ (480 files, 35.3 MB)** | | | | | | | |
| `public/music/` (4 tracks, 16 MB) | The Raum theme and three combat and boss tracks | Content | Clean | Content rebuild | The owner's music. Overlook's assets check keeps media out of git outside `bible/Attachments/`. | S | public/music/Raum.mp3 |
| `public/audio/` (325 files, 9 MB) | Enemy, weapon, reload, foley, relic and impact samples | Content | Cut | Content rebuild | Described as CC0 from Freesound, with no per-file licence or credit. Cut until each file's licence is listed. | M | public/audio/enemy/death.mp3 |
| `public/sprites/` (73 files) | Baked enemy, loot, ammo, projectile, gun and silhouette sprites | Content | Clean | Content rebuild | Baked by our tools from our geometry. Exception: `gun-silhouettes/requiem.png` renders the Requiem (Can't). | S | public/sprites/loot.json |
| `public/sprites-stargrim/` | Enemy sprites re-baked for Stargrim's top-down view | Content | Clean | Content rebuild | The owner's Stargrim bake, made by tools/stargrim-spritebake.mjs. | S | public/sprites-stargrim/stargrim-sprites.json |
| `public/fpgun/rifle.json` | Manifest for a painted rifle sheet whose image is absent | Content | Cut | Content rebuild | Its note calls the sheet generated. The PNG is not in the repository; origin unchecked. | S | public/fpgun/rifle.json |
| `public/visual-changes/` (72 files) | Before-and-after screenshots with a note per visual change | Tooling | Clean | Practice | Records of changes, which Overlook keeps in pull requests. The habit of a picture per visual change is the part that carries. | S | public/visual-changes/movement/sprint-gait/README.md |
| **art/ (16 files, 201 KB)** | | | | | | | |
| `art/fpgun/README.md, pistol.mjs` | Brief for painted gun sheets; a hand-made pixel pistol | Content | Clean | Practice | Ours. The README includes a prompt for generating sheets with an image model. | S | art/fpgun/pistol.mjs |
| `art/fpgun/refs/` (13 PNGs) | Reference images of each gun, side view and close-up | Content | Cut | Content rebuild | Origin unchecked. They may be renders of our own guns; nothing in the repository says. | S | art/fpgun/refs/ref-rifle.png |
| `art/models/BFGlike.fbx` | Blender export of the Requiem gun | Content | Can't | — | Made by someone other than the owner; no licence in the repository. | — | art/models/BFGlike.fbx |
| **bible/, as design references (49 files, 12.4k lines)** | | | | | | | |
| `Home.md, 01-Overview/Overview.md, Game Flow.md` | Index; the game as a Destiny 1 combat game; activity model | Content | Cut | Practice | Destiny's names throughout: D1, Forever 29, Fallen, Hive, Vex, Cabal. The power-climb model is the reference. | S | bible/01-Overview/Game Flow.md |
| `01-Overview/Lore.md` (**approved: adapted**, [[Raum's Lore Is Adapted Into One Mystery]]) | The Raum universe: history, the Cube, the six foundries | Content | Clean | Content rebuild | The owner's lore, from vestige-gps-source. | S | bible/01-Overview/Lore.md |
| `02-Combat/` (Combat, Encounter-Synthesis-Arc, Threat Model) | Combat model, encounter synthesis rules, threat budget | Content | Cut | Practice | Combat and Threat Model name Destiny. Encounter-Synthesis-Arc has no other game's names. | S | bible/02-Combat/Encounter-Synthesis-Arc.md |
| `03-Gear/` (Gear, Arsenal-Spec, Weapon-Grid-Arc, Loot-Drop-Arc, Relics-Arc) | Gear, weapon frames, talent grid, Prestige, economy, drops, relics | Content | Cut | Practice | The design behind the gear rows. Destiny's names throughout; 21 in Weapon-Grid-Arc alone. | M | bible/03-Gear/Weapon-Grid-Arc.md |
| `04-Art/` (Art, Pixel-Cohesion, Plate-Rig-Arc, Boot-To-Scene, First-Light-Title, Post-Start-Flow) | Pixel look rules, plate rig, boot flow and title | Content | Cut | Practice | Plate-Rig-Arc is project-dagger's body with no ARENA2 data. Art, Boot-To-Scene and Post-Start-Flow name Destiny. | S | bible/04-Art/Pixel-Cohesion.md |
| `05-Audio/` (Audio, Adaptive-Music-Arc, Stem-System-Arc, Procedural-Audio-Arc) | Audio buses, sample sourcing, stems, adaptive music, procedural voices | Content | Clean | Practice | No other game's names. Audio.md records the Freesound sourcing, without per-file credits. | S | bible/05-Audio/Stem-System-Arc.md |
| `06-Technical/Enemy-AI-Architecture, AI-Engine-Arc, Navmesh` | Four-layer combat brain, AI performance slices, navmesh roadmap | Content | Cut | Practice | Halo, Bungie and Destiny named as the models, 25 times in Enemy-AI-Architecture. | M | bible/06-Technical/Enemy-AI-Architecture.md |
| `06-Technical/Technical, Renderer-Performance, Sprite-Billboard-Arc, FP-Gun-Sprite-Arc, Gunfire-FX-Arc, Toolkit-Arc, ...` | Engine, renderer performance, sprites, gun sprite, gunfire effects, toolkit | Content | Cut | Practice | Technical.md is 1,239 lines. Technical, Sprite-Billboard-Arc and FP-Gun-Sprite-Arc name Destiny or Doom. | M | bible/06-Technical/Renderer-Performance.md |
| `06-Technical/Map-Synthesis-Arc, Module-Foundry-Arc, Procedural-Dungeon-*` | Map synthesis, the room library, one-shot dungeon composition | Content | Clean | Practice | No other game's names. The assembler follows Stargrim's, the owner's. | S | bible/06-Technical/Map-Synthesis-Arc.md |
| `06-Technical/Block-Grid-Arc.md` | Daggerfall's dungeon layout format and the laws drawn from it | Content | Can't | — | Describes Daggerfall's block format and figures from its data. Ours inside: the generator slices, which blockSynth.js holds. | — | bible/06-Technical/Block-Grid-Arc.md |
| `07-Enemies/Enemies.md, Heart-Boss-Arc.md` (**adapted**, [[The Lattice as Claude Shapes It]]) | Enemy roster, stages and archetypes; the Heart boss design | Content | Cut | Practice | Our crystal faction. Enemies.md (1,200 lines) names Destiny six times; Heart-Boss-Arc has no other game's names. | M | bible/07-Enemies/Heart-Boss-Arc.md |
| `08-Multiplayer/Multiplayer.md` | Peer-to-peer sessions: social space, fireteams, patrol zones | Content | Cut | Practice | Names Destiny and Warframe as models. A host peer decides, where Overlook's server is the sole authority. Nothing built. | S | bible/08-Multiplayer/Multiplayer.md |
| `09-Testing/Testing.md` | Test doctrine: pure sims, goldens, headless probes, guards | Content | Clean | Practice | 696 lines; no other game's names. | S | bible/09-Testing/Testing.md |
| `10-UI/` (UI, Character-Hub, Inspect-Menu, Settings-Tab-Arc) | HUD spec, character hub, inspect screen, settings tab | Content | Cut | Practice | The screens are called Destiny-shaped. Settings-Tab-Arc has no other game's names. | S | bible/10-UI/Character-Hub.md |
| `11-Missions/Missions.md, Into-the-Deep.md` | The first mission's design: enclosure, steps, the Warden | Content | Cut | Practice | Titled Strike 01, Destiny's term. | S | bible/11-Missions/Into-the-Deep.md |

## Notes

- **Destiny's names decide most Cut rows.** They sit in identifiers (`buildWarlock*`, `buildTitan*`), in the engram
  drop, in "strike" for a mission, in screens called Destiny-shaped, and in Halo, Bungie, Doom and Paper Mario named
  as models. The logic under them is the owner's.
- **Daggerfall in `src/game/dagger/`.** `itemTemplates.json`, `clothing.js`, `armorSet.js` and `paperdollArt.js`
  read or copy Daggerfall or Daggerfall Unity data, and only `tools/body-view.js` reads them. `dyes.js` (Daggerfall
  Unity) and `palettes.js` (Elder Scrolls race names) are imported by nothing. The body the game draws, `paperRig.js`
  and the lofts, reads none of them.
- **The Requiem** is one gun model by someone other than the owner, in three places: `art/models/BFGlike.fbx`,
  `src/game/meshes/bfglike.js` and `public/sprites/gun-silhouettes/requiem.png`. Its frame in `weaponRegistry.js`,
  its reload and its tests refer to it.
- **Audio samples.** `public/audio/` is CC0 by description only, and the sampled cue modules in `src/game/` play it. The music, the synth and
  the playback code are the owner's.
- **Drawing.** Every canvas except the world's goes through the CPU rasteriser or Canvas 2D, so those rows land as a
  WebGPU rewrite whatever their verdict. The hub and item screens are DOM.
- **The rules' shape.** The sims keep plain serialisable state and a pure host tick, written for a host peer that
  decides. The Rust rebuild rows rest on that, with the tests as their specification.
