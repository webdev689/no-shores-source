---
type: reference
source: DFO Online, branch ccr-aff93cb4-gw1nto-audit and the unmerged branches named below
---
# Pick List - Engine and World

Part of the [[Pick List]]. How to read the verdicts and the "Lands as" column: [[Port]].

Checkout: tip `ccr-aff93cb4-gw1nto-audit` (b172380aa7). Read only. Verdicts are technical portability only.
"Pseudo-archive" means our own picture registered under a number in Daggerfall's `TEXTURE.###` archive space, so the
renderer can key it as `archive_record`.

| Folder / module | What it is (<=12 words) | Kind | Verdict | Lands as | Seam or reason (<=25 words) | Effort | Evidence |
|---|---|---|---|---|---|---|---|
| **src/render** | | | | | | | |
| **Performance**: approved, [[Pick - Performance]] | | | | | | | |
| `render/renderer.js` | WebGL2 core: caches, mesh, character, billboard, terrain, water, decal draws | Engine | Cut | WebGPU rewrite | Material key is DF `archive_record`; tile arrays per DF ground archive; alpha-0 palette cutouts; `TextureFile.isSpectralArchive`. Needs its own material ids. | L | src/render/renderer.js:uploadTexture |
| `render/glProgram, glRelease, renderTarget, bootPrograms, playPrograms, mountPrograms, warmPrograms, idleTurn, cloudsArrival` | Compile/link, async program start queues, FBOs, GL leak release | Engine | Clean | WebGPU rewrite | Pure GL plumbing. The rule (start at load, never stall a frame) maps to async pipeline creation. | M | src/render/glProgram.js:startPrograms |
| `render/perfMeter, gpuTrail` | GPU timer readout; GPU trail kept beside a crash | Engine | Clean | WebGPU rewrite | Timer queries become WebGPU timestamp queries. | S | src/render/perfMeter.js |
| `render/frustum, bounds, billboardKey, lightId, contract, pixelFade, windowApertures` | Culling, bounds, batch keys, light ids, renderer contract types | Engine | Clean | TS port | No GL calls. Batch keys and contract shapes name `{archive, record}`, which is the material-key seam only. | S | src/render/frustum.js |
| `render/staticBatch` | Each pixel's static meshes merged by texture | Engine | Cut | TS port | Groups by DF `archive_record`; one buffer upload moves to the GPU layer. | S | src/render/staticBatch.js |
| `render/lightClusters` | Froxel clustered lights (16x9x24): CPU binning and GLSL lookup | Engine | Clean | TS port + WebGPU rewrite | Binning carries as is; the lookup is a WGSL spec (or binning moves to compute). | M | src/render/lightClusters.js:CLUSTER_X |
| `render/enhancedLighting, shadowPass, airPass, depthPrepass, bodyDepth` | Lit lane; cascaded and point shadows; AO, bloom, shafts, exposure | Engine | Clean | WebGPU rewrite | Ours. The shadows replay the hosts' draws because there is no scene graph; shadowPass reads windfallSway (a mod) for the flora's lean. | L | src/render/shadowPass.js |
| `render/classicShadowLane` | Improved Interior Lighting's shadows outside the lit lane | Engine | Cut | WebGPU rewrite | Copies a DFU mod's Unity shadow settings (soft lights, billboards that cast). | S | src/render/classicShadowLane.js |
| `render/enhancedSky, volumetricClouds, cloudNoise, cloudShadow, lightningBolts, auroraPass, sunbabySkyRenderer` | Procedural sky dome, raymarched clouds, GPU noise, cloud shadow, bolts, aurora | Engine | Clean | WebGPU rewrite | Ours. The moons' phase comes from systems/gameDate (the calendar). | L | src/render/volumetricClouds.js |
| **Weather and Sky**: ported, [[Pick - Weather and Sky]] | | | | | | | |
| `render/dynamicSkiesRenderer, dynamicSkiesBridge` | Dynamic Skies' sky pass (our shader) and its state bridge | Engine | Cut | WebGPU rewrite | The shader is ours. Presets and law are systems/dynamicSkies, a mod port whose record is still open. | S | src/render/dynamicSkiesRenderer.js |
| `render/skyRenderer, underwaterFog, windowEmission, flatAnimation` | Classic sky frames, DFU fog, window emission, animated flats | Engine | Can't | — | 1:1 DaggerfallSky.cs, UnderwaterFog.cs, MaterialReader and DaggerfallBillboard; reads SKY files and DF records. | — | src/render/skyRenderer.js |
| `render/retroPass` | DFU's retro mode: small frame and palette LUT | Engine | Can't | — | DFU feature ported; the LUT comes from the player's palette. Bayer cell kept separately (orderedDither). | — | src/render/retroPass.js |
| `render/orderedDither, fogGlsl, hazeGlsl, horizonHaze, telegraphStyle` | Shared GLSL leaves: Bayer dither and dissolve, fog, haze, telegraph look | Engine | Clean | WebGPU rewrite | WGSL include modules. | S | src/render/fogGlsl.js |
| `render/ecotoneGlsl, groundEdgeGlsl, roadEdgeGlsl, snowCoverGlsl, snowCapGlsl, wetGlsl, puddleProxyGlsl, waterBedGlsl` | Terrain chunks: biome blend, coast, road edge, snow, wet, puddles, bed | Engine | Cut | WebGPU rewrite | Decode DF ground-tile records (marching-squares set, tile-array layers). Needs our own ground-material indices. | M | src/render/ecotoneGlsl.js |
| `render/waterSurface` | Enhanced water: waves, scene copy, shore, ripples, bed | Engine | Cut | WebGPU rewrite | Ours. Water mask = DF tile record 0 and waterCorners' DF tile-byte table. | M | src/render/waterSurface.js |
| `render/deepWatersRender, columnGlsl, oceanHolesRender, comeSailAwayRender` | Iliac Puddle No More, Ocean Holes and Come Sail Away passes | Engine | Can't | — | Mod shaders read back to GLSL term for term (jet082's two mods, Come Sail Away's wave material). | — | src/render/deepWatersRender.js |
| `render/farRing, midRing, farTrees, farField, farFlora, farLandmarks, ringSnow` | Far LOD: province ring, middle ring, tree band, skylines | Engine | Cut | WebGPU rewrite + TS port | Reads the WOODS.WLD heightmap and MAPS climate (formats/mapsFile) and DF tree art. A gen2 bake can stand in. | L | src/render/farRing.js |
| `render/precipitation, rainCurtains, dryFall, windWisps` | Rain/snow volume around the camera, curtains, sand and ash, wisps | Engine | Clean | WebGPU rewrite | Ours. Only DFU's particle cap (1000) is borrowed. | M | src/render/precipitation.js |
| **Weather and Sky**: ported, [[Pick - Weather and Sky]] | | | | | | | |
| `render/heatHaze, windfallParticles, windfallSway` | Heat Haze and Windfall mod passes | Engine | Can't | — | Ports of demifiend's shaders and particle systems (record open). | — | src/render/windfallSway.js |
| `render/snowfallGlsl, snowfallSurface` | Snowfall's three snow tiers: meshes and shader | Engine | Cut | WebGPU rewrite | Shader is "our own"; its tiers come from systems/snowfallRuntime (Snowfall port, pinned to the author's C#). | S | src/render/snowfallGlsl.js |
| `render/labGrass, grassMeadow, grassPixelArt, meadowArt` | GPU grass blades, meadow sprite blend, pixel grass | Engine | Cut | WebGPU rewrite | Ours. Placement reads DF ground tiles and climate; meadowArt is baked from the owner's PNGs. | M | src/render/labGrass.js |
| `render/lowPolyTreesGlsl, lowPolyTreesRender` | Low Poly Trees' draw | Engine | Can't | — | Low Poly Trees' geometry, a mod's; atlases are the player's DF nature archives 500-511. No Shores builds its own trees ([[Which Made-for-DFO Mods Come Over]]). | — | src/render/lowPolyTreesRender.js |
| `render/grahtOakArt, jungleFloorArt, landPropArt` | Code-painted pictures: graht-oaks, jungle floor, landmarks | Content | Clean | TS port | Every texel comes from a seed. Uploaded as pseudo-archives. | S | src/render/grahtOakArt.js |
| `render/realWindows, windowLight` | Rooms behind glass (interior mapping); window light on street and floor | Engine | Cut | WebGPU rewrite | Glass is found by DFU's window table and palette index 0xff (climateSwaps.isExteriorWindow); the light law is ours. | M | src/render/realWindows.js |
| `render/characterSprite, characterMesh, characterStage, skinPalette, forgeBody, portraitRenderer` | Character pixelize pass, mesh packing, preview stage, GPU skin | Engine | Cut | WebGPU rewrite | The bone texture skins Morrowind NIF bodies (formats/morrowind/mwGpuSkin). Forge cards are ours. | M | src/render/skinPalette.js |
| `render/vfxGpu` | Morrowind spell-effect streams | Engine | Can't | — | Exists to draw formats/morrowind/mwVfx. | — | src/render/vfxGpu.js |
| `render/armoryPass, armoryPose, auraRing, auraPixel, auraPreview, effectStage, weaponGlowGlsl, weaponPiecePreview, killFx, spellImpactFx` | Cosmetics and FX: armory, auras, weapon glow, kill and spell effects | Engine | Cut | WebGPU rewrite | Ours; lore names only (Daedric, Dwemer and Aetherium colours, Oblivion ward). | L | src/render/auraRing.js |
| `render/foeTelegraph, nodeGlint, nodeGlow, npcMarkPass, partyPingDraw, partyPingLabels, spoilsGlow, duelWall, bannerPass, shipFlagPass, ambientLifePass, poiGizmoPass, meshAlpha` | Gameplay overlays: telegraphs, node glints, marks, pings, flags, creatures | Engine | Clean | WebGPU rewrite | Ours. Small foreign passes in one convention. | M | src/render/nodeGlint.js |
| `render/serpentRender, navalRender, rocketPass, newEraPass, redMountainFire, ghostfenceGlow, deadlands, courtCrystals, riteSmoke` | Set-piece passes: serpent, sea-fight FX, live events, volcano, Oblivion court | Engine | Cut | WebGPU rewrite | Ours; Red Mountain, Ghostfence and Dagon's court are lore content. | L | src/render/serpentRender.js |
| `render/cardFaces, iliacCardFaces, cardTableDraw, gambitTableDraw, iliacTableDraw` | Card and board faces painted in code; table meshes | Content | Cut | TS port | Faces themed on Daggerfall lore; color32Order from formats. | M | src/render/iliacCardFaces.js |
| `render/eliteGates/` (7) | Elite Breach passes: sky map, mist, motes, lines, lamps, stair | Engine | Clean | WebGPU rewrite | Ours. | M | src/render/eliteGates/egSkyPass.js |
| `render/gate/` (4), `render/dragon/` (1) | Oblivion Gate fire, veil, telegraphs; dragon telegraphs | Engine | Cut | WebGPU rewrite | Ours; Oblivion and Dwarven names are lore. | M | src/render/gate/gateTelegraph.js |
| `render/superDungeon/` (11) | Abyss Dungeon passes: sky, halos, rift, steps, motes | Engine | Clean | WebGPU rewrite | Ours (sdSky hangs the Bay's skylines: a lore picture). | M | src/render/superDungeon/sdSky.js |
| `render/starfall/`, `render/ketch/` | Starfall sky pass; the ketch's gauges in one instanced draw | Engine | Clean | WebGPU rewrite | Ours. | S | src/render/ketch/ktGaugePass.js |
| **src/world/gen2: World 2.0** | | | | | | | |
| `gen2/field, gridOps, exact, drainage, erosion, hydrology, riverLaw, soil, biome, vegetation, resources, stageGraph, tiling` | Generic generators: exact raster, priority flood, erosion, rivers, soils, biomes, plants | Engine | Clean | TS port + Rust rebuild | Read tables only. Bit-exact by law (IEEE ops, sqrt, imul; `INEXACT_CALLS` barred), so a Rust twin can match it bit for bit. | M | src/world/gen2/exact.js |
| `gen2/geology, climate, continent` | Terranes, ranges, relief, air and rain, continent drainage | Engine | Cut | TS port + Rust rebuild | Height goes through landforms.nodeGround and terrainSampler (DFU kernel units, WOODS-byte metres). Needs metres-native relief. | M | src/world/gen2/geology.js:byteMetres |
| `gen2/canon` | The canon layer: provinces, ranges, rivers, relief, theatre lookup | Content | Cut | TS port | Reads tamrielGeography (lore), tamrielRelief (the owner's map), tamrielLand.PROVINCE_OF_ID. The only door from generators to canon. | S | src/world/gen2/canon.js:canonTheatre |
| `gen2/tables, data/{rocks,soils,biomes,species,provinces,styles,settlementTypes,prefabs}.json` | Designer tables and the ten theatres' profiles | Content | Cut | TS port | Each biome names a DF climate byte (mapsTables CLIMATES); provinces.json = 10 lore theatres; prefabs allow an `arch3d` source. | S | src/world/gen2/data/biomes.json |
| `gen2/bakeCodec, regionBake, regionSampler, gen2Ground, padLaw, manifest, worldManifest.json` | WG2B bake format, stage runner, sampler, the seam, pads, manifest | Engine | Cut | TS port + Rust rebuild | Answers DFU kernel units (`kernelUnits`, `BYTE_METRES`) and blends into the WOODS ground. Decides height, water and pads, so the server must agree. | M | src/world/gen2/gen2Ground.js |
| `gen2/settle/settlementGen, settlementValidate, siteSelect, buildingRecord, data/townBooks.json` | Town generator stages A-G, validator, id and home-key ledger | Gameplay | Cut | TS port + Rust rebuild | Records carry DF building types (buildingNames), talkTopics.makeBuildingKey and homeLaw. Ids and home keys decide ownership. | M | src/world/gen2/settle/buildingRecord.js |
| `gen2/settle/rmbAdapter` | A Daggerfall town's RMB buildings as building records | Engine | Can't | — | Exists to read RMB blocks (buildingSummaries). | — | src/world/gen2/settle/rmbAdapter.js |
| `gen2/edit/` (6) | Editor model: layers, undo, revisions, property guard, packages, layouts | Tooling | Clean | TS port (+ Rust for guard) | Pure data. propertyGuard judges protected homes before publish (server side). canonicalJson comes from formats/worldData (generic). | S | src/world/gen2/edit/propertyGuard.js |
| `gen2/testRegions, settle/testSettlements` | Prototype regions and towns (Hammerfell, Black Marsh) | Content | Cut | TS port | Lore-named specs. | S | src/world/gen2/testRegions.js |
| `world/settle2/` (8) | World 2.0 towns streamed as DF locations: blocks, shells, features, dressing | Engine | Cut | TS port | Writes an 8x8 RMB block grid, a cloned MAPS location, ARCH3D-id models and DF textures; culture props are lore. Needs a native town format. | L | src/world/settle2/settle2Blocks.js |
| `world/settlement/{settlementContract, settlementGeometry, settlementLayout, settlementGen, settlementTree, settlementIds, settlementLimits, exactMath, settlementGround}` | Earlier settlement planner: plans in metres, terraces, ids, exact math | Engine | Cut | TS port | Ours. Reads BUILDING_TYPES, guild factions/Divines, homeLaw. | M | src/world/settlement/settlementContract.js |
| `world/settlement/{townGrowth, townGrowthJob, settlementRibbon, settlementStand, settlementModels, settlementFeatures, settlementStyles, settlementPlaces, settlementPublish, settlementEditor, settlementOwed, legacySettlement}` | Towns grown round RMB cores; terrain-worker stand; models | Engine | Cut | TS port | Grows DF towns (RMB_SIDE, mapsFile LOCATION_TYPES), DF nature records, imperialFabric models. | M | src/world/settlement/townGrowth.js |
| **src/world: terrain, Tamriel, roads, water** | | | | | | | |
| `terrain/{terrainSampler, terrainTiles, terrainNature, terrainHelper, terrainSurface}`, `world/perlin` | DFU terrain sampler, tile classifier, nature scatter | Engine | Can't | — | 1:1 DFU DefaultTerrainSampler/Texturing/Nature over WOODS.WLD; ground = DF tile records. | — | src/world/terrain/terrainSampler.js |
| `terrain/{terrainGen, terrainGenClient, terrainGenWorker, natureWire, midRingGrid, farClimate}` | Pixel kernel as a pure function on a worker | Engine | Cut | TS port | Worker plumbing is ours; the kernel it runs is DFU's (WoodsFile in the worker). | M | src/world/terrain/terrainGen.js |
| `terrain/{groundEdge, floraCover, jungleNature, capitalRelief, capitalSea, townBlendBefore, townEdge, townLanes, townMeadow, townMeet, groundTilesKept}` | Our departures in the kernel: coasts, town edges, jungle | Engine | Cut | TS port | Each edits the output of DFU's tilemap or BlendLocationTerrain, in DF tile records. | M | src/world/terrain/townMeet.js |
| `world/landforms` | Our terrain shaper over DFU heights: relief, carves, rivers | Engine | Cut | TS port + Rust rebuild | Rule: at or under the knee a height is DFU's. Reads WOODS bytes and DFU's cubic. This is gameplay ground. | M | src/world/landforms.js:nodeGround |
| `tamriel/{tamrielFrame, tamrielLand, tamrielRaster, tamrielGround, tamrielBootCache, bayFitKept}` | Continent frame, traced land, raster, ground past the Bay | Engine | Cut | TS port | Traces the player's TMAP00I0/TAMRIEL2 and fits WOODS/CLIMATE. Falls back to authored shapes; gen2 canon plus bakes can stand in. | M | src/world/tamriel/tamrielLand.js |
| `tamriel/{tamrielGeography, tamrielLines, tamrielRanges, tamrielRelief, tamrielReliefData, tamrielWaters, watersInk, tamrielLandforms}` | Authored Tamriel: rings, coasts, ranges, owner's relief, Cyrodiil waters | Content | Cut | TS port | Lore canon (110 lore hits in geography). The relief is the owner's heightmap; ranges and waters read woodsFile. | M | src/world/tamriel/tamrielGeography.js |
| `tamriel/{tamrielBiomes, tamrielLands, groundDress*, redMountain, ghostfence*, skyrimAurora, skyrimFlora*}` | Province zones, ground dress, volcano, Ghostfence, aurora, flora | Content | Cut | TS port | Lore zones keyed to DF climate bytes (mapsTables); Skyrim flora PNGs on the DF texture door. | M | src/world/tamriel/tamrielBiomes.js |
| `world/worldWide/` (7) | One world-pixel key, theatres, places registry, ports, lanes | Engine | Cut | TS port + Rust rebuild | worldPixelKey and theatres are ours. Bay places come from MAPS.BSA (bayPlaces). The server reads worldGrid and worldLanes. | S | src/world/worldWide/worldGrid.js |
| `world/atlas/` | Places indexed by entity over MAPS/BLOCKS | Engine | Can't | — | Exists to join DF's MAPS.BSA and BLOCKS.BSA. The entity-major bundle is an idea to keep. | — | src/world/atlas/atlas.js |
| `world/land/` | Land-edit rows over the ground | Tooling | Cut | TS port | Rows are WOODS/CLIMATE bytes written into DF files; the edit-layer idea carries. | S | src/world/land/landLayer.js |
| `world/peaks/` | Massif relief (not wired); snow-cap line | Engine | Cut | TS port | Ours; snowcap reads mapsTables climate. | S | src/world/peaks/massif.js |
| `world/water/` (6) | Water body levels, bed, ripples, stream levels, kernel sea | Engine | Cut | TS port | waterCorners is DFU's converted-tile-byte table; waterLevel, waterBed and waterRipples are ours. | S | src/world/water/waterLevel.js |
| `road/{roadNetwork, riverNetwork, roadLand, roadLine, roadLineLaw, roadCurves, roadGaps, roadBridges, bridgeModels, gateRoads, waysIn, townWays, cyrodiilRoads, roadEdge, roadClearance, roadDry, roadTeams}`, `world/roadsCache` | Our road and river networks, curves, bridges, gate roads, town ways | Engine | Cut | TS port | The networks are ours. Input is MAPS.BSA places and the WOODS map; they paint DF tile records in the kernel. | M | src/world/road/roadNetwork.js |
| `road/{roadPainter, pathData, roadBand, roadVerge}`, `world/roadsProducer` | Basic Roads' painter, path arrays, band, verge | Engine | Can't | — | Hazelnut's MIT painter (ported); path data from Travel Options' port; the producer reads MAPS/WOODS. Verge law ours. | — | src/world/road/roadPainter.js |
| `world/jungle/` (10) | Bantha jungle: region, owner's OBJ trees, trails, haze, graht-oaks | Content | Cut | TS port | The owner's OBJs go through Low Poly Trees' pipeline; terrainNature/terrainTiles seams; lore names. | M | src/world/jungle/jungleModels.js |
| `world/lands/` | Landmarks past the Bay: their placement rules and low-poly meshes | Content | Clean | TS port | Procedural meshes ours; reads only terrainSampler scale constants. | S | src/world/lands/landPropMesh.js |
| `world/urban/` (6) | Town fabric: streets, yards, its model, own pictures | Engine | Cut | TS port | Laid over DF town blocks (mapsFile); styles per lore province. | M | src/world/urban/townFabric.js |
| **src/world (top), DFU translations** | | | | | | | |
| `world/{rmbLayout, rmbFlats, rdbLayout, locationLayout, staticDoors, staticBuildings, buildingSummaries, meshReader, climateSwaps, emissiveTextures, exteriorGlass, billboardXml, smallerDungeons, locationEntrance, groundAlign, arch3dSeams, texRemap, wallModels, npcFlatArchives, natureArchives, buildingNames}` | DFU layout: blocks, flats, doors, mesh reader, climate swaps, names | Engine | Can't | — | 1:1 DFU RMBLayout, RDBLayout, MeshReader, TextureReader and FormulaHelper over BLOCKS/ARCH3D. The game server imports several. | — | src/world/rmbLayout.js |
| `world/actionSystem` | Dungeon action doors and linked actions | Gameplay | Can't | — | 1:1 DaggerfallAction over RDB records; the game server imports it. | — | src/world/actionSystem.js |
| `world/{streamingWorld, worldClock, weather}` | Floating-origin streamer, day clock, weather table | Engine | Can't | — | 1:1 DFU StreamingWorld, DaggerfallDateTime and WeatherManager. Keep the floating origin as an idea. | — | src/world/streamingWorld.js |
| `world/customModels` | Door for models no ARCH3D has; model-id families | Engine | Cut | TS port | Our models live in DF's ARCH3D id space through DFU's MeshReplacement shape. Needs a native model registry. | S | src/world/customModels.js |
| `world/{mat4, quat, segment, blockHash, pixelKeys, offlineOnly}` | Math and leaf helpers: Unity TRS, quaternion, segment, hash32 | Engine | Clean | TS port + Rust rebuild | Pure. The relay's wire imports mat4.wrapAngle; Unity's TRS order is a convention to keep. | S | src/world/mat4.js |
| `world/dfLook` | Snaps our painted pictures to the player's ART_PAL, grained | Engine | Cut | TS port | The palette seam for all our own art. With no palette, a picture goes up as painted. | S | src/world/dfLook.js |
| `world/{detStandIns, townStandIns, townPictures, curatedPeople, curatedPlacements, flatFields, rmbrpHillShapes}` | Stand-ins for retired town mods' pieces; RMB Resource Pack crops and hills | Content | Can't | — | Rebuilt from the player's DF records (derivedTexture) where mods placed them. Keep detStandIns' generic `MeshBuilder` (21 importers). | — | src/world/detStandIns.js:MeshBuilder |
| `world/{townDress, townShape, townOutline, townWalls, townGates, houseSigns, placeDoors, locationKey, placeIds, spawnGroundPlace, homeLook, immersiveTravelGates}` | Town shapes, walls, gates, dressing over Bay towns | Engine | Cut | TS port | Work on RMB blocks and MAPS locations through the world-data door; dressing picks DF flat records. | M | src/world/townWalls.js |
| `world/capital*.js` (17), `tamrielCapitals`, `solitudeRelief` | Capitals: plans and code-built lore landmarks | Content | Cut | TS port | Lore capitals. Served as RMB port blocks (worldDataReplacement) and MAPS records; geometry is ours. | L | src/world/capitalModels.js |
| `world/imperial*.js` (17) | Imperial City fabric: districts, buildings, interiors, impostor, worker | Content | Cut | TS port | As capitals. imperialFabricSites is generated from ARENA2; buildings come from DF blocks and meshReader doors. | L | src/world/imperialFabricBuildings.js |
| `world/{arenaLocations, arenaPlaces, arenaRoads, tamrielPlaces, tamrielCountry, tamrielDungeons, tamrielRoads*, pastBay*, tamrielAtlas, tamrielLandPieces, tamrielPeople, tamrielWatersBake, rumareWaters}` | Places, lairs and roads past the Bay | Engine | Cut | TS port + Rust rebuild | Places written as MAPS records with dfRandom; seas run on IPNM's DeepWatersBake; the server's place judge imports country and lairs. | M | src/world/tamrielCountry.js |
| `world/{etherPlaces, ethericSea, etherWatersBake}` | Eltheric Ocean: isles, open sea, its coast bake | Engine | Cut | TS port | Ours; uses mapsTables climates, templates from terrainTiles, and IPNM's DeepWatersBake. | S | src/world/etherWatersBake.js |
| `world/{harbourModels, lighthouseModel, shipyardModel, quayModel, portArt, portRecords, portWinter, winterArt}` | Port buildings' geometry and code-painted art | Content | Clean | TS port | Pure meshes and noise-painted pictures registered as pseudo-archives. | M | src/world/lighthouseModel.js |
| `world/{portSites, portSitesKept, portShore, portPlatform, portHamlet, harbourQuarter}` | Where a port's yard, lighthouse and quarter stand | Gameplay | Cut | TS port | Read MAPS places and the DF town grid. | S | src/world/portSites.js |
| `world/{newEraEvent, rocketEvent, sunbabySky, dreadSky, deadlandsLand, witchesDecor, festivalArt, lefayMonument, lefayArt, fissureArt, fissureModel, cageModel, riteModel, aurumCofferArt}` | Live events and set pieces: skies, monuments, festival dressing | Content | Cut | TS port | Ours; Oblivion, LeFay and Witches' Festival lore; witchesDecor reads mapsTables. | M | src/world/newEraEvent.js |
| `world/{oceanHoles, oceanHolesMiasma, passiveFish, seasonReskin}` | Ocean Holes, IPNM fish, Seasons of the Iliac Bay | Gameplay | Can't | — | Ports of jet082's and RosyTheRascal's mods. | — | src/world/oceanHoles.js |
| `world/{windmills, windmillMesh, windmillInterior, lowPolyTrees, lptCrowns, playerGps, outdoors}` | The windmills and Low Poly Trees; DEX GPS events; outdoors switch | Content | Can't | — | Vendored DFU mods made for DFO; DF archives; Dynamic Skies switch. No Shores builds its own trees and designs its own elements in place of the windmills ([[Which Made-for-DFO Mods Come Over]]). | — | src/world/lowPolyTrees.js |
| `world/{prefabNode, prefabColliders, skinnedBake, unityAnimator, unityParticles, shipKit}` | Unity prefab tree, raycast, BakeMesh, Animator and particles, as CSA drives them | Engine | Cut | TS port | Our code, shaped to Mecanim/Shuriken semantics and CSA's serialized fields. Needs native animation and particles. | M | src/world/unityAnimator.js |
| `world/{horseModel, horseRig, horseView, standingHorses, standFlats}` | 3D horse from the owner's rig; GL half; standing horses | Gameplay | Cut | TS port + WebGPU rewrite | The owner's FBX bake carries. Skinned through formats/morrowind/mwGpuSkin; stands in for DF horse flats (TEXTURE.201). | M | src/world/horseModel.js |
| `world/{wagonArt, wagonModels, caravanRoomModel}` | Mac's three wagons with painted art; caravan room | Gameplay | Cut | TS port | Built as Horse Cart and Cargo's parts (mod port); art snapped through dfLook. | S | src/world/wagonModels.js |
| `world/{chestModel, chairSeat, guildFurniture, guildFurnitureArt, signSolid, propBodies}` | Owner's chest, seats, guild furniture, prop colliders | Gameplay | Cut | TS port | The chest wears TEXTURE.067/.000 over ARCH3D chests; propBodies stand on DF flats. | S | src/world/propBodies.js |
| `world/{travellerSprites, bandSprites, familyBodies}` | Billboards for road parties, bands, family bodies | Gameplay | Cut | TS port | DF class and monster sprites. | S | src/world/travellerSprites.js |
| `world/{puddleMask, puddleDry, dryGround, ecotone, landView, flatDistance, naturePicture}` | Puddles, dry ground, biome blend, view distance, nature pick | Engine | Cut | TS port | Read DF tile and flat records. | S | src/world/puddleMask.js |
| `world/{spawnedDungeons, campShared, raidShared, foeHandover}` | Shared rolls and claims: spawned dungeons, camps, raids | Gameplay | Cut | Rust rebuild | Decide who stands what. raidShared runs Raiding Parties, which comes over as design ([[Which Made-for-DFO Mods Come Over]]); spawnedDungeons reads mapsFile. | S | src/world/spawnedDungeons.js |
| `world/shipRefit` | Owned ships furnished below decks | Gameplay | Can't | — | Writes building files from the player's BLOCKS.BSA (SHIPAA00/01.RMB). | — | src/world/shipRefit.js |
| `world/{card/*, gambitCloth, gambitMotion, iliacCloth, placedCardTable}` | Card table scene, motion, regulars; King's Gambit board | Gameplay | Cut | TS port | Pure. Iliac Hand is lore; King's Gambit is a mod port (gambitMotion). | M | src/world/card/cardScene.js |
| **src/world: ships** | | | | | | | |
| `ships/ownBoats/` (12) | Our five CSA hulls built from numbers: hull, parts, sails, animation | Gameplay | Cut | TS port | Geometry ours. Prefab ids 112400-112414, node names, component table and animator interface are Come Sail Away's. | M | src/world/ships/ownBoats/ownBoatFiles.js |
| `ships/{galleonModel, galleonRig, carrackModel, carrackRig, largeBoatModel, largeBoatRig}` | Owner's FBX ships rigged as CSA hulls 2, 4 and 1 | Gameplay | Cut | TS port | Meshes are Mac's (src/assets JSON from tools/bake*.mjs). The prefab tree and sail names follow CSA's walk by name. | M | src/world/ships/carrackModel.js |
| `ships/galleonMesh` | MeshBench: a mesh kit that never guesses winding, for every hull | Engine | Clean | TS port | Pure; its slots are `{archive, record}`. | S | src/world/ships/galleonMesh.js:MeshBench |
| `ships/{galleonArt, carrackArt, largeBoatArt, ownBoats/ownBoatArt, shipLiveryArt, figureheadArt, figureheadModels, standInsKept}` | Ship pictures painted in code, liveries, figurehead carvings | Content | Cut | TS port | Painted by us, snapped to the player's ART_PAL (dfLook); standInsKept stamps the palette. | S | src/world/ships/shipLiveryArt.js |
| **src/world: other subfolders** | | | | | | | |
| `world/ketch/` (8) | The Sky-Ketch: model, kit, art, poses, states, light | Content | Cut | TS port | Ours; Rourken and Dwemer lore; art painted to match DF texture measures. | M | src/world/ketch/ketchModel.js |
| `world/eliteGates/` (21) | Elite Breach: halls, platforms, ruins, vista, mesh kit, art | Gameplay | Clean | TS port | Ours. Pictures sit in a pseudo-archive registry in DF's key space. | L | src/world/eliteGates/pseudoArchives.js |
| `world/gate/` (6) | Oblivion Gate: model, arena, art, boss look, spew | Gameplay | Cut | TS port | Ours; Oblivion and Dagon lore; gateArena reads the terrain kernel. | M | src/world/gate/gateArena.js |
| `world/superDungeon/` (21) | Abyss Dungeon: realm, orrery hall, steps, remnant, art | Gameplay | Cut | TS port | Ours, but sdDungeon reads rdbLayout (DF dungeon blocks) and sdRealm the terrain sampler. | L | src/world/superDungeon/sdDungeon.js |
| `world/starfall/` | Fallen star's crater, stone and art | Content | Clean | TS port | Ours. | S | src/world/starfall/starModel.js |
| `world/merchantYards/` (5) | Stable and wagon yard: models, art, sites, town map | Gameplay | Cut | TS port | Models ours. Sites read DFU's CityNavigation, BUILDING_TYPES and town fabric. | M | src/world/merchantYards/merchantYardSites.js |
| `world/deepWater/` (15), `world/underwater/` (4) | Iliac Puddle No More: bathymetry, sea floor, swim, spawners | Gameplay | Can't | — | jet082's mod ported file by file (DeepBathymetry.cs and the rest). | — | src/world/deepWater/deepBathymetry.js |
| `dungeon/{dungeonLayout, dungeonLights, dungeonTextures}` | DFU dungeon assembly, lights, texture tables | Engine | Can't | — | 1:1 DFU over RDB blocks; the game server builds levels with them. | — | src/world/dungeon/dungeonLayout.js |
| `dungeon/{curated*, delveSites, dungeonEnd, dungeonFires, dungeonFlora, dungeonLabel}` | DELVE II curated blocks, encounter sites, fires, seabed | Gameplay | Cut | TS port + Rust rebuild | Our rules over DF RDB layouts; curated blocks edit the player's blocks; the server imports dungeonFires. | M | src/world/dungeon/delveSites.js |
| `interior/{interiorLayout, interiorLights}` | DFU interior assembly and lights | Engine | Can't | — | 1:1 DFU DaggerfallInterior. | — | src/world/interior/interiorLayout.js |
| `interior/{interiorShared, interiorRoomLoot, doorsToNowhere, interiorGlass, fabricInterior, fabricInteriorKit}` | Room keys, cupboard loot, IC interiors, glass mask | Gameplay | Cut | TS port + Rust rebuild | Interiors written as DF interior records; the loot list is the server's (infra-to-server). | M | src/world/interior/interiorRoomLoot.js |
| `world/city/` | City gate, city lights, wanderers' nav grid | Engine | Can't | — | 1:1 DFU DaggerfallCityGate, RMBLayout lights, CityNavigation. | — | src/world/city/cityNavigation.js |
| `arena/{arenaModel, arenaCity, arenaUndercroft}` | The Arena colosseum, its city block and undercroft | Content | Cut | Content rebuild | The colosseum comes over ([[Which Made-for-DFO Mods Come Over]]): its design and geometry rebuilt in our scene format and art; its Daggerfall model 864102 and 32 blocks stay. | M | src/world/arena/arenaModel.js |
| `arena/{arenaFloor, arenaPlaques}` | Arena floor instance, champions' plaque wall | Gameplay | Cut | TS port | Ours, set in the Arena colosseum. | S | src/world/arena/arenaPlaques.js |
| `world/worldOfDaggerfall/` (11) | World of Daggerfall: loader, objects, spawner, camps | Content | Can't | — | A DFU mod made for DFO, ported (LocationLoader.cs); layouts place ARCH3D models. wodMassif (our massif in place of the mod's spires) can be kept. It stays; we design our own elements ([[Which Made-for-DFO Mods Come Over]]). | — | src/world/worldOfDaggerfall/wodLocationLoader.js |
| **src/ai, src/audio, src/art, src/poi** | | | | | | | |
| `ai/nav/` (4), `ai/triRaster` | In-house navmesh (Recast-like), collider bake, worker | Engine | Clean | TS port + Rust rebuild | Pure. Foes held on the server need paths there. | M | src/ai/nav/navmesh.js |
| `ai/{tactics, tacticsClock, foeBlows, puppetBlows, blowShapes, cover, tells}` | Foe tactics brain, telegraphed blows, poise and stagger, cover | Gameplay | Cut | Rust rebuild (+ TS puppet) | Ours, over DFU's EnemyAI, ENEMY_BASICS, MOBILE_TYPES and SKILLS; the game server imports tactics and foeBlows. | M | src/ai/tactics.js |
| `ai/enhancedMotor` | Wires the brain into the enemy motor | Gameplay | Cut | Rust rebuild | Wraps characters/enemy/enemyMotor.js (DFU's EnemyMotor). | S | src/ai/enhancedMotor.js |
| `audio/synth/dsp`, `audio/layeredLoop` | Synth primitives; a bed in loops of lengths with no common factor | Engine | Clean | TS port | Pure and seeded. | S | src/audio/synth/dsp.js |
| `audio/synth/clips`, `audio/{recordedClips, recordedClipUrls}` | Clips by name, from the synth and CC0 recordings | Content | Cut | TS port | Keys are Immersive Footsteps' and Better Ambience's clip names; the recordings are CC0 and need no permission. | S | src/audio/synth/clips.js |
| `art/ownPainter` | Pixel painter: shapes, dithered ramps, dark rim | Engine | Clean | TS port | Its own palette; reads no file. | S | src/art/ownPainter.js |
| `poi/{poiLaw, poiMesh, poiImage}` | POI document, mesh and image rules | Platform | Clean | TS port + Rust rebuild | server-account imports them to validate uploads. | S | src/poi/poiLaw.js |
| `poi/{gltfImport, gltfExport, poiImport, poiTransfer, poiPack, poiThumb, poiEdit, poiDiff, poiGizmo, poiRuntime, poiFeed, poiService, poiShelf, poiText, poiImageDecode}` | POI editor: glTF in/out, packs, thumbnails, gizmo, feed | Tooling | Clean | TS port | Ours. poiImageDecode's GL decode becomes ImageBitmap or WebGPU. | M | src/poi/gltfImport.js |
| `poi/uv/` (4), `poi/sparseCholesky` | UV editor: seams, islands, LSCM unwrap, sparse Cholesky | Tooling | Clean | TS port | Pure numerics on a worker. | M | src/poi/uv/uvMesh.js |
| **Tools** | | | | | | | |
| `tools/wg2Bake.mjs, wg2Measure.mjs` | Offline bake, `--check` reprint, province tiles, measures | Tooling | Clean | TS port | Reads the repository only, no ARENA2. `--check` is a determinism gate worth keeping. | S | tools/wg2Bake.mjs |
| `tools/wg2Bench.mjs, wg2TownProbe.mjs, worldRenderGate.mjs` | Headless Playwright budgets, town probe, render gate | Tooling | Clean | Practice | The gate's point: render the real world in CI. The scripts are tied to DFO's hosts. | S | tools/worldRenderGate.mjs |
| `tools/worldTownProbe.mjs, worldWhereIsProbe.mjs` | Probes booted at Daggerfall city | Tooling | Can't | — | Classic city and DFU Where-is. | — | tools/worldWhereIsProbe.mjs |
| `tools/worldDataPackBuild.mjs, worldDataPatch.mjs, worldOfDaggerfallAssets.mjs` | Mods' world-data packs and patches; WoD extraction | Tooling | Can't | — | Unity bundles and DFU World Data over BLOCKS/MAPS. | — | tools/worldDataPackBuild.mjs |
| `worldeditor.html`, `src/tools/worldEditor.js` | World Editor: map, brushes, towns, revisions, 3D view | Tooling | Cut | TS port | Its model is gen2/edit (Clean); the 3D view builds ground through terrainTiles/terrainSampler (DFU). | S | src/tools/worldEditor.js |
| `water.html`, `src/tools/waterLab.js` | Water lab on a made-up pixel | Tooling | Cut | TS port | No game data, but tiles go through DFU's classifier (generateTileData, assignTiles). | S | src/tools/waterLab.js |
| `ketch.html`, `src/tools/ketchLab*.js` | Ketch lab: the ship lit as aboard | Tooling | Cut | TS port | Imports formats/textureFile. | S | src/tools/ketchLab.js |
| `sky.html`, `src/tools/skyLab.js` | Sky lab on sliders | Tooling | Cut | TS port | Pulls Dynamic Skies' runtime and assets and world/weather (DFU). | S | src/tools/skyLab.js |
| `firmament.html`, `src/tools/firmamentLab.js` | Firmament passive-tree window lab | Tooling | Clean | TS port | UI, not rendering; no game data. | S | src/tools/firmamentLab.js |
| `grass-proto.html` | Standalone WebGL ground and 3D-grass prototype | Tooling | Clean | Practice | Prototype before any engine change; no game data (tools/groundProto.mjs tiles). | S | grass-proto.html |

## Unmerged work in this area

- **`ccr-e8635dec-jsv7iy`** (ship refit, seabed): already on main, squashed as #1435 (5448b7afcb), then grown on the
  tip. The tip has shipRefit at 469 lines against the branch's 238, and dungeonFlora at 340 against 241. The branch's
  `standInSprites.js` has since been retired by the forge. Nothing to carry past the tip.
  - shipRefit: **Can't** (furnishes SHIPAA00/01.RMB from the player's BLOCKS.BSA).
  - Seabed (dungeonFlora): **Cut**. The placement rules are ours; they place flats TEXTURE.105/.106 in DF RDB blocks.
- **`infra-to-server`** (734 commits). In these paths:
  - (a) **AI decided on the server.** Each seat rations its own melee tokens, and foes wind up at the seat they hunt
    (`ai/tactics`, `foeBlows`, `cover`). Rust rebuild, with DFO as the spec.
  - (b) **Loot on the server.** Interior cupboard loot is the server's stock (`interior/interiorRoomLoot`,
    `interiorShared`). Rust rebuild.
  - (c) **Renderer frame-time work.** Depth prepass for dungeons, shadow-pass memos, a water copy limited to its rows,
    far window light, static batches. It comes over as WebGPU rewrite practice, not as code.
  - (d) **New `world/dungeonSizeDraw.js`.** A seeded size per map id. Clean; Rust rebuild.
  - (e) **The new `game-server/` imports the DFU-translated world code** to build levels and interiors itself:
    rmbLayout, rdbLayout, meshReader, dungeonLayout, actionSystem, smallerDungeons, customModels, townStandIns,
    arch3dSeams. Its place judge imports tamrielGround, tamrielCountry, tamrielDungeons, ethericSea and worldLanes.
  - (f) **The open country has no ground on the server.** `game-server/src/fieldBody.js` checks only the walking
    pace there.
- **`ccr-cab30c1a-oddrwb`** (Dungeons 2.0, read at 648073ab): the Forge and the dungeon engine, approved as far as
  they fit ([[Pick - Dungeons 2.0]]).
  - The Forge (`world/forge/forgeGrid`, `forgeMesh`, `forgeBlock`, `forgeDungeon`, `forgePictures`): **Cut**, Rust
    rebuild. The grid, rooms, ways and mesh are ours; the blocks are served as Daggerfall RDB records with its
    markers, people and riddles.
  - The plan and its print (`world/dungeon/plan/`): **Clean**, not needed: one Rust crate lays the same dungeon
    everywhere.
  - The engine's parts (`scenes/dungeon/`, `systems/dungeon/`): the heart **Cut**, Rust rebuild; traps and last fire
    **Cut**, left behind, as they lean on DFU's stats, rest and light table; the director **Clean**, left behind, as
    the garrison does what it would. **Proposed, awaiting the owner**: moods and dressing **Cut**, their law rebuilt
    (a style's own faint light, a room's dressing and lights by its purpose, the forged props in place of DFU's
    sprites); landmarks **Clean**, their law rebuilt (each room named for its purpose, the name on the screen while
    the player stands in it).
- **`pve-fixed-levels`**: no change in these paths.
- **`ccr-d314ccd0-3nwvjt`**: field fixes to `interior/interiorLights` and `road/roadPainter`. Both files are Can't.

## Notes

- **World 2.0 has a clean core and narrow seams.** These are generic and bit-exact by rule: field, gridOps, exact,
  drainage, erosion, hydrology, riverLaw, soil, biome, vegetation, resources, stageGraph, tiling and edit/. The ten
  theatres and the Tamriel canon enter at only two points: `gen2/canon.js` and `data/provinces.json`. The Daggerfall
  ties are three:
  - `geology.byteMetres`/`gen2Ground.BYTE_METRES` (DFU kernel units over WOODS bytes);
  - the DF climate byte each biome names;
  - building records typed by `buildingNames.BUILDING_TYPES`.
- **The authoritative server must agree on some World 2.0 output.** That output is regionSampler height and water,
  padLaw, drawnAt and the minted town ids and home keys. Today the server has none of it (see infra-to-server (f)).
  Because exact.js allows only IEEE basic operations, sqrt and imul, a Rust reader of the WG2B bake plus the sampler
  can match bit for bit. That is the natural ground contract.
- **The renderer's whole material model is keyed by Daggerfall's `archive_record`.** This covers texture caches, tile
  arrays per ground archive, billboard batches and palette-index-0 cutouts. Our own art (ships, ports, yards, gates,
  ketch, capitals) is registered under pseudo-archive numbers in that space, then snapped to the player's ART_PAL by
  `world/dfLook.js`. Replacing that key is the first job of the WebGPU material layer.
- **Shaders worth carrying as WGSL specs:**
  - renderer.js: TERRAIN_VS/FS (tile array plus tilemap decode, textureGrad), BB_VS/FS, CHAR_SKIN_VS;
  - lightClusters plus the enhancedLighting lane;
  - shadowPass cascades, airPass (AO, bloom, shafts, adaptation), volumetricClouds with cloudNoise and cloudShadow;
  - enhancedSky, waterSurface with waterBedGlsl;
  - precipitation, windowLight, realWindows (interior mapping);
  - farRing and midRing;
  - labGrass, orderedDither, fogGlsl.
- **Ships, split three ways.**
  - Hull meshes: `ships/ownBoats/` geometry is ours, built from numbers. Galleon, carrack and large boat are Mac's FBX
    files baked to `src/assets/*.json`.
  - Prefab structure: every hull, ours and Mac's, is still wrapped in Come Sail Away's structure (prefab ids
    112400-112414, node names walked by name, sail names, animator controllers).
  - Sailing runtime: `systems/comeSailAway/*` is a 1:1 port of the mod's assembly. It depends on that walk, on
    `world/unityAnimator`, `unityParticles`, `prefabNode`, `prefabColliders` and `skinnedBake`, on
    `comeSailAwayModels.decodeMeshGeometry` and on `helmWay`.
- **Misfiled: water.** `world/deepWater/`, `world/underwater/`, `world/passiveFish.js` and `render/deepWatersRender.js`
  with `columnGlsl.js` are jet082's Iliac Puddle No More, ported. The Tamriel and Eltheric sea bakes
  (`tamrielWatersBake`, `etherWatersBake`) run on its `DeepWatersBake`.
- **Misfiled: shared mesh kit.** The generic `MeshBuilder` that settle2, settlement and capitals use lives in
  `world/detStandIns.js`, a module about retired mods' pieces. There are four parallel mesh kits: MeshBuilder,
  `ships/galleonMesh` MeshBench, `eliteGates/meshKit` and `merchantYards` YARD_MESH_KIT. All group by
  `{archive, record}`.
- **Everything new in the world is served as Daggerfall-shaped data.** Capitals, the Imperial City, settle2 towns and
  places past the Bay become RMB blocks, MAPS locations and ARCH3D-id models through `formats/worldData`. The DFU
  layout readers (rmbLayout, rdbLayout, locationLayout, interiorLayout) are Can't, so each generator needs a native
  scene format to land in.
- **The terrain under everything is DFU's.** The sampler, the tile classifier and nature (WOODS.WLD) are 1:1 DFU.
  landforms only shapes above the beach knee. The kernel and worker split and the far-LOD rings are ours, but they read
  DFU's output.
- **Mods made for DFO.** World of Daggerfall, the Arena colosseum, the windmills, Low Poly Trees and Raiding Parties
  are vendored DFU mods. The owner decided ([[Which Made-for-DFO Mods Come Over]]): the Arena and Raiding Parties come over as design and geometry on our
  own formats and art, No Shores builds its own trees, and World of Daggerfall and the windmills stay while we design our own elements. Their DF
  texture and ARCH3D references stay behind.
