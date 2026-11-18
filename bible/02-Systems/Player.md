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
  - client/src/player/others.ts#OtherPlayers
  - client/src/player/roomPlay.ts#RoomPlay
  - client/src/player/roomPlay.ts#RoomFight
  - client/src/player/gear.ts#RARITIES
  - client/src/player/gear.ts#nodeShown
  - client/src/player/gear.ts#gearHands
  - client/src/player/gearLooks.ts#gearOutfit
  - client/src/player/fightMoves.ts#foeDoing
  - client/src/player/crosshair.ts#crosshairPoint
  - client/src/player/foeFigures.ts#FoeFigures
  - client/src/player/glide.ts#Glides
  - client/src/player/picture.ts#addedBy
---
# Player

The player as they play, wherever they stand: the [[Test Ground]] and the [[Game]] hold the same one. Its controls,
moves and figure are DFO's ([[The Player Plays as in DFO]]); the Test Ground's note says how each plays.

## How it works

- **The walker** (`Walker`) is one frame of play. It steps the body by the [[Movement]] rules it is handed, under
  the frame's input, swings the [[First Person]]'s weapon, and chooses the move the figure shows from outside. The
  page that holds it chooses the rules: the Test Ground's course, a node's ground with its section judged, or a
  room's, which sends each tick's controls on. In a fight the walker turns to its lock and shows the fight's moves
  (`fightMoves.ts`). A page may set the walker's player: a room's correction, a respawn, a move played from a
  panel.
- **The camera** sits in the head, or behind it and up in third person, short of any block between
  (`cameraOrbit`). The page draws from it.
- **The figure** is composed from the [[Sprite Forge]]'s strips and kept as cards (`Cards`). Whatever draws the
  scene makes the cards (`CardMaker`): the Test Ground's scene, or the game's figures, drawn into its scene's pass.
  The walker gives the player's own card for an eye; other players' figures stand where their room last saw them, in
  their own dress when it reads as one (`OtherPlayers`, `showOther`), as in the game's nodes so on the Test Ground.
- **A room** (`RoomPlay`): it is joined with the player's session, if they have one, to keep their character
  ([[Accounts]]). The player's rules there send each tick's controls on, with what the figure shows, the dress when
  it changed and a respawn when asked; in a fight (`RoomFight`) each tick's input goes to the fight, which carries the
  controls, the buttons, the arms, a gear ask and the respawn, and predicts the body as a fighter ([[Combat]]). Each
  snapshot corrects the prediction, keeps the player's standing with the room's section, holds a dead body still,
  and moves every other player's figure, which the page places and takes away ([[Server]]); foes are drawn in their
  kinds' dress (`FoeFigures`), every figure gliding between snapshots (`Glides`).
- **Gear** (`gear.ts`, `gearLooks.ts`): the gear the room sends, as the screens and the figure read it: its
  rarities' colours, its nodes, what the hands hold (`gearHands`) and what the figure wears (`gearOutfit`, [[Gear]]).
  An item's own picture is the pixels its layers add to the figure, less any speck apart from the piece (`addedBy`).
- **The crosshair** (`crosshair.ts`) finds where a shot would strike, over the ground and the bodies.
- **The input** (`Input`) reads the keys and the mouse on the page's canvas, with the pointer locked to look round.

## Limits

- The Test Ground steps the body only while the pointer is locked; the game steps it always, with nothing pressed
  while a menu is open.
