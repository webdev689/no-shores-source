---
type: system
status: live
code:
  - client/src/player/walker.ts#Walker
  - client/src/player/walker.ts#mountAsked
  - client/src/player/player.ts#updatePlayer
  - client/src/player/playerCamera.ts#cameraOrbit
  - client/src/player/playerCamera.ts#handsZoom
  - client/src/player/boom.ts#boomReach
  - client/src/player/playerMoves.ts#shownMove
  - client/src/player/input.ts#Input
  - client/src/player/binds.ts#CONTROLS
  - client/src/player/pad.ts#PadReader
  - client/src/player/cards.ts#Cards
  - client/src/player/cards.ts#CardMaker
  - client/src/player/figures.ts#viewOf
  - client/src/player/dressing.ts#plainDress
  - client/src/player/others.ts#showOther
  - client/src/player/others.ts#OtherPlayers
  - client/src/combat/playerFight.ts#PlayerFight
  - client/src/player/gear.ts#RARITIES
  - client/src/player/gear.ts#nodeShown
  - client/src/player/gear.ts#gearHands
  - client/src/player/gearLooks.ts#gearOutfit
  - client/src/player/fightMoves.ts#foeDoing
  - client/src/player/crosshair.ts#crosshairPoint
  - client/src/player/glide.ts#Glides
  - client/src/player/picture.ts#addedBy
---
# Player

The player as they play, wherever they stand: the [[Test Ground]] and the [[Game]] hold the same one. Its controls,
moves and figure are DFO's ([[The Player Plays as in DFO]]); the Test Ground's note says how each plays.

## How it works

- **The walker** (`Walker`) is one frame of play. It steps the body by the [[Movement]] rules it is handed, under
  the frame's input, swings the [[First Person]]'s weapon, and chooses the move the figure shows from outside. The
  page that holds it chooses the rules: a fight's in a room, which sends each tick's intent on and predicts the
  fighter ([[Combat]]), or a ship's deck. In a fight the walker steps and shows the frame in two halves, the fight's
  buttons pressed before the step and what the fight holds the player to shown after it (`PlayerFight`), on the Test
  Ground and in the game's nodes alike. The fight steps only while its room's clock runs, so a cutscene that holds
  the room (the wreck's) leaves no inputs waiting in its queue, and no blow late after it. A page may set the walker's
  player: a move played from a panel.
- **Riding** ([[Horses Are Items Worn in a Mount Slot]]): the mount key mounts only with a horse worn in the Mount
  slot, as the room allows (`mountAsked`). The walker rides only once the gear the room sends says a horse is worn
  (`ridesIn`, on foot, in the prologue's wreck and on the Test Ground alike); one taken off under its rider sets them
  on foot. With none, a press does nothing and the frame it was pressed in says "You have no horse." once for it,
  ashore or at sea; the story says nothing. Getting down is never refused. A new character's first horse is the
  stranger's Bay ([[Gear]]).
- **The boost** ([[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]]): a rider taps the jump's key (Space, or the pad's A, as the jump is
  rebound; a horse never jumps, so a rider's jump is its boost) for half again the horse's pace, walking or
  galloping, for 4 s; then it recharges for 12 s before it may boost again. The run stays as it is. It is the
  movement rules' (`boost_run`, `TUNING`'s `ride_boost`, `boost_seconds`, `recharge_seconds`): the controls carry
  the tap (`boost`) and the body its two clocks (`boosting`, `recharging`), so the room steps it and the page
  predicts it to the bit; a tap on foot, or while it runs or recharges, does nothing. The walker queues the tap to the
  next tick as it does a jump. Its ring stands at the bottom left while riding ([[Interface]]) and its sounds are the
  horse's ([[Interface]], "Horses").
- **The boost's look** (`combat/hoofDust.ts`, laid with the fight's marks): as it begins the hind hooves dig in, dust
  bursting out round them (18 motes) and clods of earth flying up behind (8); while it runs the hooves strike in turn
  ten times a second at a boosted walk's pace or faster (fewer slower, none standing), each kicking up dust that hangs,
  swells and thins behind the horse, a clod one strike in three; as it ends the horse sits back in a low cloud thrown
  ahead and to the sides (14). Stone (and a footstep's wood, only the wreck's) throws paler dust and no clods, water a
  white spray. Every mote is a square of the figures' pixels facing the eye, from one pool of 192 shared by every
  rider, the oldest given up for a new one, so it makes nothing new a frame. In a node every rider drawn throws it,
  each from their own boost: the player's own, and another player's as the room last stepped their body (their
  fighter, sent to every page, begins with it); one no longer drawn is let go.
- **The camera** sits in the head, or behind it and up in third person on a boom (`cameraOrbit`). Through the
  head it sees 65° tall where third person sees the lens's 50°, widening as the camera comes in past third person's
  nearest, 0.6 m;
  the first person's weapon keeps its size, zoomed by aiming alone (`handsZoom`) ([[First Person Widens and Its Weapon Sways, and the Parry Ring Reads Bolder]]). Where a block
  or the ground stands between the head and the boom's end, the boom comes in to stand 0.25 m short of it, eased in
  fast and let out slowly so it never snaps (`boomFollowed`, `boom.ts`); however it eases it stands no nearer a block
  or the ground than 0.12 m, so the near plane never cuts through a wall, and indoors it shows the room from inside.
  A block the head stands in, as a room's volume, does not hold it. The page draws from it. An address asks for a
  camera to arrive with, as for a spawn: `&view=first` or `&view=third,<metres>`.
- **The figure** is composed from the [[Sprite Forge]]'s strips and kept as cards (`Cards`). Whatever draws the
  scene makes the cards (`CardMaker`): the Test Ground's scene, or the game's figures, drawn into its scene's pass.
  The game's also says on which frames a figure standing in the world has its card chosen afresh (`poseDue`; [[Game]],
  "The figures each frame"); between them it keeps the card it showed.
  Each figure's likeliest moves are queued once for each dress it wears (`Cards.warm`, asked each frame but working
  out the moves only for a new dress), and again once one of them is let go before it was asked for ([[Test Ground]],
  "Limits"). The figure holds the weapon the fight's rules hold: one changed while they are
  busy shows once they take it up at rest. The walker gives the player's own card for an eye; other players' figures
  stand where their room last saw them, in their own dress when it reads as one (`OtherPlayers`, `showOther`), as in
  the game's nodes so on the Test Ground.
- **Its strips are fetched ahead.** A new dress has every strip of its likeliest moves fetched at once, as drawn and as
  mirrored, in the order the moves are likeliest shown: a move's strips take a second or more to fetch and a few
  milliseconds to compose, so a blow first played would otherwise show as a still. The worker composing the frames
  (`StripFetcher`) fetches six at a time, each dress's next in turn, skipping any strip already held, and each strip
  with its depth in one range, as the packs lay them side by side; a joined range that fails falls back to each strip's
  own. A strip fetched ahead that fails is let go at once, so a frame that wants it fetches it again; one the page names
  no place for is none, and is not kept as missing. The fetched bytes are kept (32 MB) apart from the decoded strips
  (128 MB, a few moves of a few dresses), so a strip let go is decoded again rather than fetched. Every strip's bytes
  are read from its pack a 256 KB block at a time, each block kept in the browser's storage (`forge/store.ts`,
  `PackBlocks`; [[Areas Load in Chunks With Proper Caching]]): the strips a dress asks for together lie together in a
  pack, so a burst of them comes in one request, and from the disk after.
- **A room** (`Fighting`): it is joined with the player's session, if they have one, to keep their character
  ([[Accounts]]). Each tick's intent goes to it, with what the figure shows, the dress when it changed, a gear ask and
  a respawn when asked. Each snapshot corrects the prediction, keeps the player's standing with the room's section,
  holds a body dead past its edge still, and moves every other player's figure, which the page places and takes away
  ([[Server]]); every figure glides between snapshots (`Glides`).
- **Gear** (`gear.ts`, `gearLooks.ts`): the gear the room sends, as the screens and the figure read it: its
  rarities' colours, its nodes, what the hands hold (`gearHands`) and what the figure wears (`gearOutfit`, [[Gear]]).
  An item's own picture is the pixels its layers add to the figure, less any speck apart from the piece (`addedBy`).
- **The crosshair** (`crosshair.ts`) finds where a shot would strike, over the ground and the bodies a
  shot of the player's stops on as the room flies it: living foes, never the dead, companions or other players
  (`shotBodies`). The player's own arrows stop only on those bodies too.
- **The input** (`Input`) reads the keys and the mouse on the page's canvas, with the pointer locked to look round,
  and the pad each frame (`PadReader`), each through the player's binds (`binds.ts`, [[Interface]], "The pad" and
  "Binding a control"): a stick moves and turns as far as it leans, as the keys move and turn the whole way. The game
  has its controls (a frame's `locked`: the fight's buttons, the teaching's answers) while the pointer is locked, or
  while the pad was the last played, as a pad's press is never a click on the page.

## Limits

- The Test Ground steps the body only while the pointer is locked; the game steps it always, with nothing pressed
  while a menu is open.
