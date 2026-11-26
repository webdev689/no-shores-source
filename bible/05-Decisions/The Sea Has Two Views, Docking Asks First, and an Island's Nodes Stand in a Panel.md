---
type: decision
date: 2026-11-26
status: in force
---
# The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel

> "On this note.
>
> We havent really touched anything having to do with the sea in awhile.
>
> 1. I'd like to remove wasd from overworld view and only use it in sea level view.
>
> 2. 2 views. Oversea and Sealevel. Remove scrolling to change view.
>
> 3. Rework the ship UI to be extremely more detailed and organized. A switch between views with each view having its
> own buttons pertaining to its view. Remove the speed toggle. Oversea travel planning now goes x200 by default. x60
> by basic point and click.
>
> 4. Remove the dock at port button at the bottom and remove the Playlist from the sea. The port icon should instead
> ask for confirmation to dock when clicked. Clicking elsewhere on the island outside of the port does the same.
>
> 5. In the overworld pane when docking. Remove the nodes on the maps themselves and instead when in this view show a
> detailed non-obstructive, slighry transparent panel view with the applicable following
>
> 1. Port Panel (Detailed port snapshot inside the panel)
>
> 2. Playlist (Detailed playlist banner inside the panel)
>
> 3. Patrol (Detailed snapshot of the patrol zone)
>
> 4. Dungeon (Procedural dungeon if applicable)
>
> Note: Dungeon nodes do not currently lead into a dungeon
>
> 5. Mission Name (If applicable)
>
> I want you to take autonomy and be as detailed as possible, minimizing bugs and bringing everything in line to be
> more detailed. Please dont come back until this is 100% complete"

## What it settles

- **The sea has two views, Oversea and Sealevel.** The wheel no longer changes the view.
- **W, A, S and D sail the ship in the Sealevel view alone**, not in the Oversea view.
- **The ship's panel is reworked**, more detailed and organised, with a switch between the two views and each view's
  own buttons. It has no speed toggle.
- **Paces.** A voyage planned in the Oversea view sails at ×200; one set by a click on the sea, at ×60.
- **Docking asks first.** No dock button stands at the foot of the screen. A click on a port's icon asks to confirm
  docking there, and so does a click anywhere else on its island.
- **No Playlist at sea.**
- **Docked, the island's nodes stand in a panel**, not on the map: detailed, out of the way and slightly
  transparent, holding what the island has of its port, the Playlist, its patrol zone, its dungeon and its mission.
  The dungeon leads into a dungeon.
- **The rest is Claude's**, on the owner's autonomy, recorded below and open to the owner's change.

It replaces, in part, [[The Sloop Is Sailed by Its Keys and Seen Close From Any View]] (the keys in every view),
[[The Sea Is Navigated From the Helm With the Held Map]] (the offer to dock and the nodes shown over the island),
[[Elite and Abyss Dungeons Are Queued From a Playlist Beside Each Port]] (the Playlist on the map), and wholly
[[The Playlist Shows Over Its Island, Not Only at Sea]].

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| The Sealevel view | The close view brought down behind the ship, 25 m off, from whatever height the Oversea view stood at; the Oversea view is the raised camera, its wheel zooming within it | The two views the sea already drew, now a switch and no longer a scroll |
| The switch | V on the keys, the pad's left, and the console's two presses; eased over about a second | V was free, and a switch wants one key both ways |
| The wheel | Zooms only within the Oversea view; at sea level it changes nothing | The owner removed the scroll between views, not the zoom |
| A click on the sea | Sails at ×60 in the Oversea view only; at sea level it sets no course | W, A, S and D sail there; a click and the keys would fight |
| Marks at sea level | A port's icon, an island and a hostile ship's mark still answer a click in both views | Docking and the chase are not the keys' work |
| W's pace | Sailing straight on is set at ×60 and eases to true speed while watched close | The click's pace, as the pace already eased while watched |
| Eased pace while watched | Kept: at sea level, at the helm, in Manage and on the deck the pace eases down the ladder to ×1 and back up | The ship is seen at its true speed close up; the voyage's own pace is kept |
| The room's pace ladder | Raised to 5, 10, 20, 30, 40, 60, 100 and 200 | ×200 needs the sea room to sail it |
| The confirmation | A window a little above the middle of the view: "Dock at Overlook?" in brass, what yes does, Cancel (Esc) and its yes (Enter) | Over the ship's console it would hide it; in the middle it is read |
| The key L | Kept: it asks after the landing the sea offers where the ship lies | A keyboard way to the same question |
| Yes out of reach | The ship makes for the harbour, or the coast clicked, at ×60 and docks once within 20 km of the harbour (30 km of the coast to go ashore); the console names where it is bound | The landfall's own reach, so the ask works from anywhere at sea |
| What lets it go | No, a click elsewhere, a fight, the helm, going aboard or a travel put the question by; another course (a click, W, a chase) or a fight lets a landing made for go; a stop keeps it to be resumed | A question never stands over a view that cannot answer it |
| A coast with no port, a sea island | A ruined city's coast asks "Go ashore on Cairnwatch?"; a click within 400 m of a sea island's reach asks to go ashore on it | "Clicking elsewhere on the island" does the same, wherever there is no port to dock at |
| The panel's place | Down the left of the view, 104 px down and 24 in, 40% of its width (280 to 400 px), on a ground 74% opaque edged in brass, scrolled | Out of the island's way, which flies to the view's right |
| The panel's entries | Docked: the port's snapshot, the Playlist's banner, then every patrol zone, Elite Dungeon, mission, world boss and outpost by kind; gone ashore, the places alone | The owner's five, and the boss and outpost kept so no place goes unreachable without its node |
| The port's snapshot | A chart of the island with its harbour and the ship, its counters, its moorings and the Playlist; its press lands in the plaza | What the port holds, before landing |
| The Playlist's banner | Today's modifier, the Elite and the Abyss of the week with their levels, the rewards, and the four crests; its press opens the Playlist | The detail the Playlist's own screen leads with |
| A patrol zone's snapshot | Its levels, its dungeons and which is the dungeon of the day, its resources, its foes, its Elite and Abyss seas' levels, today's modifier; its press lands there | What the zone holds, from the data the island already has |
| A dungeon's entry | "Go in from the sea" opens the Elite Dungeon's card at Normal; it finds a group or starts a run in a room of its own from the sea, and a run's end brings the ship back to the sea | The owner noted the node led into no dungeon |
| A mission's entry | Its name, and why it is locked where it is; its press lands at it | The owner's "if applicable" |
| Enter on the panel | Does the chosen entry's press, the first's while none is chosen; Escape or Back to the sea flies back down | As the island's nodes answered Enter |
| The ship's console | Header: the ship's name and class, and the switch. Body: a compass with the heading and the wind; the voyage (way, pace, speed, where it is bound, a bar of the way sailed, its line); the ship (hull, canvas, crew, the water). Foot: Oversea: Plan a voyage (N), Stop or Resume (Space); Sealevel: Sail on (W), Heave to (S), Manage (B), Leave the helm (H) | Each view's own buttons, as the owner asked, with every figure the sea already knew |
| When the console stands | While the ship is the player's to sail: not at the helm, aboard, in a fight or on a travel | Those have screens of their own |

How it works: [[Game]], "At sea" and "Landings"; [[Overworld]]; [[Interface]].
