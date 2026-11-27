---
type: decision
date: 2026-11-27
status: in force
---
# M Is the Map, N the Leave, and the Players' First Asks Are Built

A player wrote in the Discord, playing on the keys and mouse, that changing controls was hard to read (the words far
right of their keys), that Tab and the mouse's other thumb button could not be bound, that the map was on N and the
leave on M, that there was no master volume and no scale, that the camera needed a press after the inventory, that the
map's legend could not be hidden and covered the map, that opening the map at sea lagged, and that nothing said what
the landings' icons meant. Of the legend the owner answered there:

> "Yeah I need a hide button for that"

Asked which to build, the owner chose from Claude's options:

| Asked | The owner's pick | The option as offered |
|---|---|---|
| Controls | "Tab bindable" | Let Tab be bound to a control (it's reserved for moving between windows now). |
| | "Thumb buttons anywhere" | Let mouse side buttons bind to Map, Leave, Inventory, Character, Use, etc. (keys-only today). |
| | "Readable rebind rows" | Put what each control does first, its keys right beside it, instead of the dim words on the far right. |
| | "Move map/leave keys", and in the owner's words: "M forever map and N for leave" | Map is on N, leave-to-ship on M. |
| Settings and maps | "Master volume" | One slider over the four volumes (interface, world, music, ambience). |
| | "UI scale" | A size setting for the whole interface; today only render resolution exists. |
| | "Hide map legend" | A key/button to hide the held map's legend. |
| | In the owner's words: "Hovering the icon should tell you what it means" | (offered: a key on the landings/sea map saying what each icon means) |
| The camera after the inventory, and the sea map's lag | "Yes, both" | Find the cause of each and fix what's fixable offline. |

## What it settles

- The map is on M, on foot and at the helm; the leave held is on N ([[Interface]], "The leave held"; [[Held Map]]).
- Tab binds as any key does, and the two side buttons bind any control ([[Interface]], "Binding a control").
- Each row of the sheet of every control, and of Settings' Controls, reads its words first, its keys beside them
  ([[Interface]], "The sheet of every control").
- Settings' Audio has a master volume over every sound, and Graphics an interface size ([[Interface]], "Settings").
- The held map's legend hides and shows again ([[Held Map]], "The legend").
- The pointer on a landing tile's icon says what it means ([[Interface]], the island's tiles).
- A window shut where the mouse looks round gives the mouse back at once ([[Game]]), and the sea map lays its names
  out far less often and far faster ([[Held Map]], "Lettering").

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| The legend's key | A control of its own, Legend, on L, heard while any map is up (at the helm too, where the map takes every key), no pad button until one is bound; the strip names it; hidden, it stays hidden in this browser | A key to hide it, bound as every control is; L is free on foot, and the map up takes the helm's L |
| The side buttons | The back and forward buttons bind any control, coming to the game as keys of their names, heard with the pointer free and kept from it wherever a window keeps the keys, and never take the page back or forward; the left, middle and right stay with the controls that hear them | They press nothing of the interface, so no click is taken from a window |
| Binds kept on the keys that moved | A default now on a key the player kept for another control gives it up (the Legend, the map or the leave may be left without a key until bound), where before the player's bind went back to its own | A player's own bind is never lost to a new default |
| Tab | Bound, it acts before it walks a window's focus | The player bound it to act |
| The interface size | Auto (the screen's own, as before), 1x, 2x, 3x and 4x, each offered where it leaves at least 960 by 540 of the interface's pixels; at 1920 by 1080 that is 1x and 2x | The interface is drawn so every pixel is whole: a size between would draw its pixel letters unevenly |
| The master volume | First of the volumes, whole at first, over the other four | It sits above them as one control |
| The icons' words | A small dark card over the icon with what it means, a padlock saying why its place is shut | The words each icon already says to a screen reader |
| The camera | The last window shut gives the mouse back where a click would take it, while the keys and mouse were played last | The click it saves is the one the player named |
| The sea map's lag | The names keep their layout until the ship's arrow has moved 4 px, the arrow drawn where the ship is; each name's test of its sea answered from tables summed once a grid | Measured: a layout took 250 to 650 ms and ran every frame under way; now some 13 to 18 ms, and seldom |
