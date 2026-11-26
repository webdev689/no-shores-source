---
type: claude-calls
date: 2026-11-26
status: in force
---
# Island Textures as Claude Builds Them

The owner asked that the islands and the passages' hollows wear the procedural textures and left how to Claude.

## What it settles

Claude's choices in building [[The Islands and the Passages' Hollows Wear the Procedural Textures]]. The owner can
change any of them. How it works is in [[Island Drawing]] ("The ground"), [[Procedural Textures]] and [[Passages]].

| Choice | Chosen | Why |
|---|---|---|
| The pictures | The mainland's own ground tiles, painted by its painter for the island's climate (`groundTiles`): its grass, dirt, stone and paving, its winter set's snow and the desert's sand; and for the rock the climate's caverns' wall of layered beds (set 20, record 0), painted with them | Nothing new is painted; an island wears what the land beside it wears, and its rock what the caverns under it wear |
| How they are worn | As the land wears them: each class's colour times its tile's grain over the tile's mean, read twice (plain and wider, turned), and one class giving way to the next by their grains | The same code, lifted so both shaders share it (`TILE_GRAIN_WGSL`) |
| An island's colours | Kept: the climate's inland and high colours, the kit's rock, the beach's sand, the snow line, as before; the tiles add only their grain | The islands keep their look by climate |
| A climate's island | Its low ground wears the grass tile, its high ground the dirt, as the land's highlands do | As the mainland |
| A hollow's floor of one ground | The tile of the ground its colour is nearest: turf and grass the grass, earth and leaf litter the dirt, sand and a shell bed the sand, bare rock and chalk the stone | A strand reads as sand and a ravine as earth, without the hollows' table naming a tile |
| A court | The climate's paving tile in place of the drawn flagstones | The land's streets wear it; one paving for both |
| The rock | The kit's rock and rockAlt parts (cliffs, stacks, outcrops, boulders, shore rocks) and the ground's steep faces (a hollow's walls) wear the caverns' rock, 4 m to a repeat, its beds level, cast from the three axes and blended by how a face is turned | The ground's stone tile is pebbles seen from above and read as a speckle on a wall; the caverns' beds read as a rock face, and a face is not stretched down it. A ruin's dressed stone keeps its colour |
| Before the tiles are painted | The ground is drawn in its plain colours, and a place is warmed (`IslesView.warm`) until its climate's tiles are painted, for at most 5 s | A hollow or an island is not shown flat and then grained a moment later |
