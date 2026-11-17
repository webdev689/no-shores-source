---
type: system
status: live
code:
  - client/src/player/walker.ts#Walker
  - client/src/player/player.ts#updatePlayer
  - client/src/player/playerCamera.ts#cameraOrbit
  - client/src/player/playerMoves.ts#shownMove
  - client/src/player/input.ts#BINDINGS
  - client/src/player/cards.ts#Cards
  - client/src/player/cards.ts#CardMaker
  - client/src/player/figures.ts#viewOf
  - client/src/player/dressing.ts#plainDress
  - client/src/player/others.ts#showOther
  - client/src/player/roomPlay.ts#RoomPlay
---
# Player

The player as they play, wherever they stand: the [[Test Ground]] and the [[Game]] hold the same one. Its controls,
moves and figure are DFO's ([[The Player Plays as in DFO]]); the Test Ground's note says how each plays.

## How it works

- **The walker** (`Walker`) is one frame of play. It steps the body by the [[Movement]] rules it is handed, under
  the frame's input, swings the [[First Person]]'s weapon, and chooses the move the figure shows from outside. The
  page that holds it chooses the rules: the Test Ground's course, a node's ground with its section judged, or a
  room's, which sends each tick's controls on. A page may set the walker's player: a room's correction, a respawn, a
  move played from a panel.
- **The camera** sits in the head, or behind it and up in third person, short of any block between
  (`cameraOrbit`). The page draws from it.
- **The figure** is composed from the [[Sprite Forge]]'s strips and kept as cards (`Cards`). Whatever draws the
  scene makes the cards (`CardMaker`): the Test Ground's scene, or the game's figures, drawn into its scene's pass.
  The walker gives the player's own card for an eye; other players' figures stand where their room last saw them
  (`showOther`).
- **A room** (`RoomPlay`): the player's rules there send each tick's controls on, with what the figure shows, the
  dress when it changed and a respawn when asked. Each snapshot corrects the prediction, keeps the player's standing
  with the room's section, holds a dead body still, and moves every other player's figure, which the page places and
  takes away ([[Server]]).
- **The input** (`Input`) reads the keys and the mouse on the page's canvas, with the pointer locked to look round.

## Limits

- The Test Ground steps the body only while the pointer is locked; the game steps it always, with nothing pressed
  while a menu is open.
