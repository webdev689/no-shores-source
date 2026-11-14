---
type: system
status: live
code:
  - client/testground/index.html
  - client/src/testground/testgroundMain.ts
  - client/src/testground/player.ts#updatePlayer
  - client/src/testground/motor.ts#stepBody
  - client/src/testground/playerCamera.ts#scrolled
  - client/src/testground/playerMoves.ts#shownMove
  - client/src/testground/dressing.ts#figureOf
  - client/src/forge/outfit.ts#outfitLayers
  - client/src/forge/compose.ts#composeFrame
  - client/src/forge/dyes.ts#PaletteSnap
  - client/src/forge/store.ts#ForgeStore
  - client/src/firstperson/firstPerson.ts#FirstPerson
  - client/src/firstperson/weaponMachine.ts#WeaponMachine
  - client/src/firstperson/fpFrames.ts#weaponPicture
---
# Test Ground

An open stretch of ground for playing a [[Sprite Forge]] figure with every move the forge draws, as the player plays
it ([[The Player Plays as in DFO]]). It is published with the site at
`https://lattymoy.github.io/overlook-source/testground/`. Under `npm run dev`, open `/testground/`.

## Playing

Click the view to play; Escape frees the mouse. The controls are DFO's:

| Control | Does |
|---|---|
| Mouse, arrow keys, `Insert` `Delete` | Look and turn |
| `W` `A` `S` `D`, `Shift` | Walk at 4.43 m/s; run at 7.59 m/s |
| `Space` | Jump, 0.5 m high. At a wall: vault a low thin one, or mantle onto one whose lip is in reach (1.8 m). Held into a higher wall, the jump catches its lip and hangs from it |
| `C` | Crouch or stand, 2.53 m/s crouched; let go of a ledge or a wall |
| Into a wall too high to grab | Climb it; at the lip, hang |
| Hanging: `A` `D`, `W` | Shimmy along the lip; climb over it |
| `Z` | Ready the weapon or put it away |
| Right click, held | Swing; holding swings again. A swing readies a weapon put away |
| `Q` | Cast |
| `,` | Mount or dismount: 6 m/s, galloping at 12 with `Shift` |
| Wheel, Mouse4 | Pull back into third person and further, or come back into first person; Mouse4 switches straight |

Third person starts 2 m behind the head and 0.5 m up, and each wheel notch moves it 0.2 m, up to 10 m. Nearer than
0.8 m, the next notch returns to first person. The camera eases into place in about a tenth of a second and stops
short of a wall.

North of the start is a course: steps, a low thin wall to vault, a crate to mantle, a 2.3 m ledge to catch on a jump
and shimmy along, a 4 m wall to climb, and stairs up to a platform. The blocks have a darker line at each metre of height.

## What the figure shows

The player's figure shows the move the forge draws for what the body does:

- **On a wall or a ledge:** the mantle and vault by their progress; the hang, or the shimmy while moving along the
  lip; the climb, held on its first frame while still.
- **In the air:** the jump's rising, top or falling frame.
- **Mounted:** the horse's rest, walk or gallop.
- **Acting:** the cast. A swing plays one stroke of the weapon's attack, frames 0 to 2, and the next swing frames 3
  to 5. A weapon held alone thrusts when swung up, chops when swung down, and swings two-handed when swung left or
  right, where the forge draws it in those.
- **Otherwise:** crouching, running, or the weapon's own walk and rest. A bow, a crossbow, a staff and the guns each
  have their own.

The left hand decides the stance. A shield or a torch there guards, marches and slashes; a blade there fights as a
pair. Each holds only where the forge draws both hands' things in that stance's attack. Otherwise the right hand's
weapon keeps its own moves and the left hand's thing is worn.

In any move, a weapon or shield the forge does not draw in hand is worn on the body for that move.

Walking frames last 0.25 s, running 0.125 s and crouching 0.5 s. A swing lasts 1 s. On a wall or a ledge the weapon is
worn, since both hands hold on. The figure faces where it moves and keeps that facing when still. Swinging or casting,
it turns to face where the camera looks.

## Dressing

The panel lists the figures. The player is first; the others stand where they are placed, each playing a chosen move
in a loop. For the chosen figure it sets:

- **Body and race:** Human with a skin tone from light to deep, Felid or Anole ([[Three Races]]).
- **Hair:** a style and its colour.
- **Armour:** a set for each piece, or one set for all.
- **Clothes:** worn in the order they are ticked, each in one of Daggerfall's dyes.
- **Hands:** what is in each hand, and whether it is drawn.
- **Dress as:** one of the forge's dressed looks.

The player's entry plays any move once. Each other figure's entry sets its move, facing and turning.

The figure is dressed as DFO's game dresses it ([[DFO's Sprite Forge Comes Over Exactly]]):

- A helm shades the face and lays a hood down; a raised hood shades the face too.
- Armour with nothing on the chest has its set's padding under it.
- A cloak or robe hangs clear of plate, and of a skirt to the ankles, which hides the greaves.
- Hair hangs clear of plate and over a cloak, and is not drawn under a helm or a hood.
- A weapon put away is worn on the body.

## How it draws

The page reads `content/forge/renders.json` and fetches the forge's index and tables from R2. Each strip is read from
its pack by its byte range and decoded once.

A frame is composed in the browser as DFO's game composes it (`composeFrame`):

- Each layer's cell is laid on the figure's cell by its root.
- At each pixel the nearest texel shows. Where two layers meet on one part of the body, the one with the higher order
  is drawn over the other: armour over cloth by its cover, a drape and a worn weapon by `under`.
- The bare body takes the race's skin or the human tone. Hair takes its colour's ramp. A metal layer's grey takes its
  set's metal and a garment's grey its dye, each a run of Daggerfall's palette.
- Then every texel is snapped to the nearest colour of the palette.

The view shown follows the turn between the figure's facing and the eye, and the three side views past the back are
the other side's, mirrored. Each frame stands upright on the figure's feet at 62 pixels a metre, turned to face the
eye.

## Limits

- A figure is drawn as one flat card, so two figures that overlap are ordered as whole cards, not pixel by pixel.
- The course's blocks are the only things to climb, and the climbing does not tire.
- Composed frames are kept on the GPU up to 4,000, then all are let go and composed again as needed.
- The player's likeliest moves are composed ahead, two frames a tick: its rest, walk and attack, its strokes, the run,
  the jump and the crouch. A move not composed yet shows the last frame until it is.

## First person

`FirstPerson` draws what the player holds in first person, from the forge's first-person pictures. Each frame the
page hands it the attack button and the player's state: the weapon in each hand, the gauntlets and boots worn, whether
the weapon is drawn, walking or running, the metres walked, a cast and a climb. It answers the blow that lands, so the
figure seen from outside can play a matching move.

### Swinging

A click swings once. Holding the button swings again as each blow ends. Each blow takes one of six directions at
random: down, down and left, left, right, down and right, or up. A strike is five frames, and the blow lands as the
third begins. A frame lasts 0.199 s for a sword, DFO's swing law at an average Speed. A dagger and bare hands come
round quicker; a mace, a flail and the two-handed weapons slower. Bare hands' strike to the left goes up and back down
over eight frames.

A bow draws while the button is held and stays drawn at its fourth frame. Letting go looses it: the arrow leaves on
the sixth frame, a frame every 0.0625 s. The bow then reloads for about half a second.

### Which picture

Each frame shows one picture, named by the weapon's file, its record and its frame. A metal's own picture is used where
the forge drew one, else the picture every metal shares. A dagger or a sword is laid from two layers, the hand in the
gauntlets worn and the blade in its own make, the nearer shown at each texel. A bow is laid under the hands that hold
it. Fists wear the gauntlets for a punch and the boots for a kick.

The forge draws every metal grey. A grey texel goes to the nearest step of Daggerfall's metal band and takes that
step of the metal's ramp; every other colour snaps to the nearest palette colour. Steel, leather, chain and the guilds'
sets keep their own colours. Bare hands take iron's.

### On the screen

Each picture lies at its own place on a 320 by 200 design screen, scaled to the canvas, texel for texel, with its
clear texels cut out, over the scene. A weapon in the left hand alone is mirrored about the middle at rest and in the
strikes down and up, from the forge's left-hand picture where it drew one.

While walking, the picture dips a few design pixels each step, more at a run. A flail at rest wears its chain's swing,
a pendulum the walk sways. Running with empty hands or a sheathed weapon pumps both arms, the left half a stride behind
the right. A climb lowers the weapon out of the bottom of the screen. A cast shows both casting hands for 0.28 s and
hides the weapon meanwhile. A new look's pictures are composed ahead and kept on the GPU.

### Not yet in first person

- A shield, a torch or a lantern in the left hand, and the climbing hands.
- A weapon's wear.
- A weapon in each hand: only the right one is drawn.
- The player's own Speed, Strength and the weapon's weight, which would change the swing's pace.
