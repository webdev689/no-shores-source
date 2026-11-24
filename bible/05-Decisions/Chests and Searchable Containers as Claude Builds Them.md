---
type: decision
date: 2026-11-24
status: in force
---
# Chests and Searchable Containers as Claude Builds Them

> "Take autonomy, be as detailed as possible and return when this is 100% complete"

## What it settles

Claude's choices for the chests and the searchable containers
([[Patrols and Dungeons Hold Chests, and Their Containers May Be Searched]]), after Destiny 1's loot chests, which
stood at a few of a patrol's spots at a time and held Glimmer, a planetary material and now and then an engram. The
owner can change any of them.

| Choice | Chosen | Why |
|---|---|---|
| Loot, Aurem and patrol materials | A Vestige by chance, Aurem always, the island's resource | Vestiges are the game's engrams; the island's resource is what a patrol's nodes give |
| No XP | A chest and a search pay none | The owner named three things; Destiny 1's chests paid no XP |
| A chest's pay | 30 Aurem at level 5, grown with the level as a kill's worth is; 2 to 4 of the island's resource; a Vestige one time in four, coloured as a Major's drop (`gear::finds::CHEST`) | About four Major kills' Aurem and a node's worth of the resource (a node gives 3); a Major leaves one 4 times in 100 |
| A search's pay | 8 Aurem at level 5; one of the resource one time in two; a Vestige one time in twenty, coloured as a Minor's (`gear::finds::SEARCH`) | A container is a small find, met often: a Major kill's Aurem |
| A harder voyage | Raises the Aurem and the Vestige's chance by its reward, as a kill's | One rule for everything a fight or a find pays |
| The find's level | The island's band's middle, raised by the room's seas as its foes are; an Elite Dungeon of the week's fixed level where it holds one | As a sea island's wreck is levelled; a find is of the place, not of the player |
| A full stock | The chest opens and pays its Aurem and Vestige; the resource past 200 is left | A gather is refused at a full stock, but a chest holds more than its resource |
| The Vestige | Thrown out of a chest to lie 0.8 m before it, out of a container to the player's feet, as a kill's drop is: seen by them alone, taken by walking over it, mailed if left | The drops' own way, popping and settling as every drop does |
| A patrol's set places | Its layout marks them as sites (`layout::chests`): round each area a body comes to but its landing, gates and way in, round each climb's lookout and each run's beat, before a face of something at least 1 m tall (a building, a ruin's wall, a rock, a tent, a stack of crates, a parapet), square to the world, facing away from it | Destiny's chests are tucked away; a chest in the open of a road reads as dropped |
| How a place is kept | Its middle 0.75 m out from the face; its box (1.1 by 0.8 m) clear of every box and prop over its ground; on dry, level (0.2 m), open land in the ring; 1.5 m off every way's edge; 1.5 m off a building walked into (its doors), 0.1 m off any other; 1 m from a planting; 25 m from another place, 10 m from a resource place, its node or a beacon, 15 m from a spawn; 2 a place at most, 24 a layout | The event chest's lid swings 0.4 m back past its back; apart so two never stand side by side |
| How many stand in a patrol | One for every five places, 2 at least and 4 at most | A few at a time, so a player goes looking |
| How a patrol's chests move | Each stands 5 minutes at its place, then moves on to another place no other chest holds, as a new chest; the first ones staggered so one moves every 5 minutes over their count | Destiny 1's chests came back elsewhere; one moving at a time keeps chests always standing |
| Who opens one | Every player opens each chest once; it stays for everyone else; opened, it is kept for their account in that room however often they rejoin | Destiny 1's chests were each player's own to open |
| A patrol's containers | Its layout's props of the holding families (cabinets, cupboards, wardrobes, dressers, shelves, crates, sarcophagi, tombs, `dungeon::models::HOLDERS`), inside its ring and in the buildings walked into, one in six searchable at most 16, drawn again every 10 minutes | Objects "have a chance"; ten minutes, so the same box is not searched twice in a visit |
| A dungeon's chests | One for each block (2 to 5, an Elite Dungeon's 4 or 5), each in a room of its own past the way in's but the end (where the cache stands) and never a seal's room; where rooms run short a room holds a second, two cells from every other | "These same chests" in every dungeon; the end has its cache, and a seal's floor its pieces |
| Where in a dungeon's room | Against a rock wall of one of its cells, its back 0.35 m off the wall and facing into the room, clear of rock and every solid; never on a doorway's cell, the way in's, the portal's, under a torch, or on a cell holding a prop, a fixture or a landmark | Every kit piece stands at most 0.3 m proud of a wall, so none is met |
| A dungeon's containers | Its props of the holding families, one in four searchable, at most 16 | A dungeon is smaller and its rooms full of them |
| When a dungeon's are drawn again | As its cache shuts, when its end foe stands again; never at an Abyss wipe | As its garrison stands again; a wipe must not be a way to draw again |
| Unforeseeable | Every draw is made on the room's loot seed, on a stream and a count of its own, at its first tick once its host has seeded it | No player can work out where a chest will stand, and no other roll moves with them |
| Opening | E held 1 second for a chest, 1.5 seconds to search, on the gather's hold, ring and charge sound; within 2.5 m of a chest's middle or 1.5 m of a container's sides, and 2 m of its foot up or down; moving, being hurt, mounting or the find going stops it | The nodes' feel ([[Material Nodes Stand Where They Are Dressed, Worked by Holding E]]), quicker, as a chest is a find |
| Not on horseback | Neither offered nor taken mounted | As a node is not |
| The use's words | "Hold to open the chest"; "Hold to search the crate" (the cabinet, cupboard, dresser, shelves, wardrobe, sarcophagus or tomb) | The container named, so the player knows what they search |
| Before the other uses | A chest or container within reach is offered before every use but a public event's chest: a counter, a point, a chapter, a node or a door | No counter stands in a patrol or a dungeon, and a find is rarer than a node; a chest is never on a doorway's or the way in's cell |
| Playing alone | The finds read the room's word on the gear online or alone, as a public event's chests do | A page playing alone shows and opens them as a live room's |
| A patrol's chest's look | The public events' plain chest and its lid (`tools/modules/chest.py`), its lid swinging back as it opens | The game's own chest, made in the Blender pipeline |
| A dungeon's chest's look | The cache's chest (`dungeonChest.ts`), lit by the torches, its lid swinging to 1.35 rad, just short of upright | The dungeon's scene draws its own; short of upright, the lid stays clear of the kits on the wall behind |
| Opened | The lid swings open over 0.6 s and the chest stands open 4 seconds, then goes; one that moved on goes at once | Seen to open; Destiny 1's chests vanished once looted |
| Its sound | The interface's open as a public event's chest's, and its clunk (`ship.ready`) where it stands | The event chest's own sounds, no new pick |
| The marks | A chest wears a chest (wood under an arched lid, banded in iron, its lock brass) over its lid; a searchable container a glass in a brass rim over its top; 12 by 12 as the door's, seen through walls within 30 m as every mark is | [[What a Player Can Use Wears Its Mark Over It]]; a container is otherwise one of many |
| The held map | Marks no chest or container | Finding them is the point; the nodes are marked because they are a route |
| The feed | "Chest", or "Searched the wardrobe", with its mark and no count, over what it gave | The event chest's line, named as its mark |
| A room playing alone | The page hands it the layout's chest places and the props of the holding families, which the room takes as holders as the bake's (`dungeon::models::held_by`) | Offline plays as online |
| What the rooms carry | The bake writes each patrol's `chests` (x, y, facing) and `holders` (box, foot, top, model) into its node file; the bake now reads the dungeon crate's families | One list of holding families, the rules' |
| Where they are not | Sea islands' landings, the social spaces, the sea, the Test Ground | The owner named patrols and dungeons |
