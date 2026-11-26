---
type: decision
date: 2026-11-26
status: in force
---
# The Island's Tiles Are Painted Scenes, and Each Patrol Zone Has Three Landing Zones

> "I was thinking of a unique panel design with very minimal text. Like super artistic direction"

Asked which artistic direction each tile should take (emblem cards, painted vignettes, or a cartographer's chart), the
owner chose "Painted vignettes". Asked how much text should stay on each tile (the name and its levels with other
details as small glyphs, the name only, or the name, levels and one line), the owner answered:

> "#1 plus for salts patrol spaces I want to implement 3 landing zones in each, with the panel opening the patrol
> zones map as a larger panel allowing you to select where you want to land. Additionally, these should act as fast
> travel points when in the zone itself"

Asked whether "salts patrol spaces" meant Saltmere's patrol zones or every zone's, the owner answered:

> "Yes. Other zones are defered"

On the first tiles painted, the owner said:

> "You can do better than this. We gave more detail to the website images"

## What it settles

- **Each island tile is a painted vignette** of its place, with very minimal text: its name and its levels, every other
  detail shown as small glyphs.
- **Saltmere's patrol zones each have three landing zones**; the other zones' are deferred.
- **A patrol zone's tile opens the zone's map as a larger panel**, where the player selects which landing zone to
  land at.
- **The landing zones are fast travel points** while the player is in that zone.

It replaces, in part, [[An Island's Places Stand as Even Tiles in a Grid, and the Playlist's Opens Its Screen]]: the
tiles' look and their text, and what a patrol zone's tile does; and it changes, in part,
[[Each Patrol Zone Has a Built Landing Site, Its Guards Beyond It]]: three landing zones where a zone had one site.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| The painting | Pixel scenes on the website's own sheet and parts, now shared from `client/src/art/`: dithered skies and ranges in the sheet's lights, each texel two pixels | The owner's "We gave more detail to the website images": the same hand, not a second style |
| Each kind's scene | The port: Overlook by night up its rock to the beacon. The Playlist: its crests as a constellation in a crystal night. A patrol zone: hills, a landmark, a hamlet, trees, a fence, the path, and three landing lanterns. An Elite Dungeon: its gate in a hillside between braziers. A mission: ruins under a banner, a shrine or a broken windmill. The boss: a horned shadow over a burning sea. The outpost: a palisade and tower on a strand. The island: charted with its relief and shoals | Each place's own look, from what the game already says it is |
| Variety | Seeded by the place: a patrol zone's light (dawn, night, mist) and landmark; a dungeon's light and the colour within; a mission's light and kind | Two places of one kind are never painted alike |
| The words | Its name in brass at the larger size and its levels in short ("Lv 1–5"); every other detail a glyph from the Journal's icons, and all of it in the tile's label | The owner's "#1": name and levels, the rest as glyphs |
| Motion | The tiles rise into place one after another as the view opens; a lit tile steps up 2 px with a brass edge | One moment as the island opens; still under reduced motion |

How it works: [[Interface]], "The island's tiles"; [[Game]], "Landings".

Not built yet: the three landing zones, the zone's map to choose one from, and their fast travel. A patrol zone's tile
lands at the zone's one landing site, as before; its scene paints the three lanterns the decision asks for.
