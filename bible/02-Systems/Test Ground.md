---
type: system
status: live
code:
  - client/testground/index.html
  - client/src/testground/testgroundMain.ts
  - client/src/testground/aimPanel.ts
  - client/src/player/player.ts#updatePlayer
  - client/src/player/player.ts#shownBody
  - client/src/player/others.ts#showOther
  - client/src/player/figures.ts#cardStand
  - client/src/network/roomAddress.ts#roomAddress
  - client/src/player/dressing.ts#dressFrom
  - client/src/player/playerCamera.ts#scrolled
  - client/src/player/playerMoves.ts#shownMove
  - client/src/player/dressing.ts#figureOf
  - client/src/forge/outfit.ts#outfitLayers
  - client/src/forge/compose.ts#composeFrame
  - client/src/forge/dyes.ts#PaletteSnap
  - client/src/forge/store.ts#ForgeStore
  - client/src/testground/blood.ts#TestgroundBlood
---
# Test Ground

An open stretch of ground for playing a [[Sprite Forge]] figure with every move the forge draws, as the player plays
it ([[The Player Plays as in DFO]]), the same [[Player]] the [[Game]] plays. It is published with the site at
`https://lattymoy.github.io/overlook-source/testground/`. Under `npm run dev`, open `/testground/`.

## Playing

Click the view to play; Escape frees the mouse. The body moves by the [[Movement]] rules, and the controls are DFO's:

| Control | Does |
|---|---|
| Mouse, arrow keys, `Insert` `Delete` | Look and turn |
| `W` `A` `S` `D`, `Shift` | Walk at 4.43 m/s; run at 7.59 m/s |
| `Space` | Jump, 0.5 m high. At a wall: vault a low thin one, or mantle onto one whose lip is in reach (1.8 m). Held into a higher wall, the jump catches its lip and hangs from it |
| `C` | Crouch or stand, 2.53 m/s crouched; let go of a ledge or a wall |
| Into a wall too high to grab | Climb it; at the lip, hang |
| Hanging: `A` `D`, `W` | Shimmy along the lip; climb over it |
| `Z` | Ready the weapon or put it away |
| Right click, held | Swing; holding swings again. A swing readies a weapon put away. With a bow, a crossbow or a gun drawn: aim, over the shoulder or down the weapon's side, a bow charging |
| Left click or `F`, held | Guard; pressed just as a blow lands, parry. With a bow, a crossbow or a gun drawn: fire, a quick shot at the locked foe, or the aimed shot onto the crosshair; holding fires again as it reloads |
| `V` or Mouse5 | Dodge the way you move, or straight back |
| `Q` | Cast |
| `,` | Mount or dismount: 6 m/s, galloping at 12 with `Shift` |
| Wheel, Mouse4 | Pull back into third person and further, or come back into first person; Mouse4 switches straight |

Third person starts 2 m behind the head and 0.5 m up, and each wheel notch moves it 0.2 m, up to 10 m. Nearer than
0.8 m, the next notch returns to first person. The camera eases into place in about a tenth of a second and stops
short of a wall. Aiming a ranged weapon, it eases behind the right shoulder, 0.8 m out, 3 m back and 0.25 m up from
the head, and zooms in 1.3 times ([[The Third-Person Aim Stands 0.8 m Out and 3 m Back]]); in first person the view zooms in 1.6 times, the hands with it
([[Aiming Sits Behind the Shoulder and Zooms the View]], [[First-Person Aiming Zooms the Weapon With the View]]).

The panel's **Third-person aim** places that view by hand: sliders for how far right of the head it stands (left below
zero), how far behind and above, and its zoom. A ticked **Hold the aiming view** keeps the camera there, with the
crosshair, while the sliders move, without a weapon drawn. The place is kept in the browser, and its numbers are
shown to copy into the game's own (`AIM` in `playerCamera.ts`); **Back to the game's** returns to them.

North of the start is a course: steps, a low thin wall to vault, a crate to mantle, a 2.3 m ledge to catch on a jump
and shimmy along, a 4 m wall to climb, and stairs up to a platform. The blocks have a darker line at each metre of height.

## Fighting

The Test Ground plays the [[Combat]] rules in a room, always: alone, the room crate itself runs in the page's
WebAssembly; with `?room=`, a server's. The page predicts the player's fighter by the room's own rules and takes the
room's word for it, so playing alone and online are the same game.

- **Foes.** The panel stands a foe of each kind 5 m ahead of where the player looks, facing them, at most twelve, or
  sends every foe away; a foe asked for while the forge still loads is not asked for. Each
  fights by its brain ([[Foes]]) and is dressed by its kind: the skirmisher in leather with a pair of daggers, the
  swordsman in mail with a sword and kite shield, the brute in iron plate with a warhammer, the archer in leather with
  a short bow, and the captain in ebony plate with an ebony sword.
- **What figures show.** A fight holds a figure to the forge's own moves: the death and then lying fallen; fallen
  when knocked down; hurt while staggered or flinching; the dodge roll through a dodge, on the ground and in the air,
  no weapon seen through it, held or worn, as the forge draws none in the roll (where the forge draws no roll, the
  jump's rising, top and falling frames through the dodge's hop, or the run where it does not draw what is held in the
  jump); the parry's deflect, or a shield's
  block; the guard held as the parry's first frame or a shield's block; a telegraphed blow's stroke raised through its
  wind-up and held at its end when it overreaches; a gun aimed, its shot's aimed frame, before it fires. A foe's swings are its stroke's frames, by its weapon, landing their last with the blow.
- **The ground.** A telegraphed blow's shape is marked on the ground where it lies: gold, red when iron, its edge
  drawn at once and its fill growing with the wind-up, brighter in its last fifth of a second. An iron one has a second
  edge inside the first, so it reads without its colour, and "Dodge!" floats over a foe near the player as it begins
  one. Arrows and bolts are drawn in flight.
- **Tracers.** Every shot draws a tracer, a hot core in a wider glow. A ball's head races from the muzzle to where it
  stopped at 350 m/s, a 6 m streak behind it and the line faint behind that, then fades over 0.3 s; a flash marks the
  muzzle. An arrow or a bolt trails the last 0.3 s of its falling flight. The player's own shots draw at once from the
  weapon as drawn, the first person's muzzle in its firing frame or the figure's along the shot, joining the shot's
  true flight within 0.15 s; one the room's word makes an input fire that it had not first predicted draws as that word
  comes. Others' come from the room's word, each ball's line from the one snapshot that carries it. Where a shot comes
  to rest it throws six sparks back the way it came.
- **Blood.** Each hit sprays [[Blood]] from the struck body's chest onto the ground and the blocks, a player's swing
  throwing it the way the blade went; a wounded body drips a trail, and a dead one lies in a spreading pool.
  `?blood=off` draws none.
- **Sparks.** A parry, a block or a guard broken throws sparks from where the guard met the blow, a little toward
  the striker at a guard's height: white-hot streaks that fall, cool to orange and burn out within half a second.
- **The attack feel.** Four effects over the fight's blows, each switched on or off and set by a slider in the panel's
  **Attack feel**, kept in the browser with its numbers shown to copy ([[The Attack Feel Is Tried in the Test Ground]]). Only the drawing moves: the fight's
  rules and their clock never do.
  - *Swing arc.* A streak of light along each blow's path, laid from the rules' own stroke, landing, reach and width:
    an overhead comes down, a sweep crosses as wide as it strikes, a slant cuts down and across, a thrust drives out.
    Each part fades by how long ago the blade passed it and burns by how fast it went, so only the cut glows; a ribbon
    along the tip turns to the eye, so a cut seen edge on still shows, and a dark rim keeps it clear against the sky.
    It burns in the weapon's metal (daedric red, steel blue, elven gold), gold for a riposte or a counter; it flares
    where the blow meets something, stops where a flinch or a dodge cuts it short, and through the eyes crosses the
    view. Brightness and trail are set.
  - *Hit-stop.* As a blow lands, its striker and the one struck hold still (a block 0.05 s, a hit 0.075 s, a kill
    0.14 s), the one struck shuddering, then catch up at 1.6 times. Its length is set.
  - *Camera kick.* The player's blow landing punches the view down and along the stroke, harder for a kill; a blow
    stopped by a guard knocks it back; a blow landing on the player jolts it and shakes it as hard as the harm; and
    the view leans into the player's own swing as it lands. Its strength is set.
  - *Lunge.* The striker's figure drives into its blow and settles back: a thrust 0.32 m, an overhead or a slant 0.2 m,
    a sweep 0.14 m; through the eyes, the eye goes half as far. Its distance is set.
- **The crosshair.** While a ranged weapon aims, and whenever one is drawn in first person, a crosshair marks the
  view's middle, where an aimed shot lands; a bow aiming rings it with its draw, gold once at full power.
- **The display.** Health, stamina and poise at the bottom left, the stamina flashing when a swing or a dodge is
  pressed with none; the soft lock's target marked at its chest, with its name, health and poise at the top; a small
  health bar over each struck foe within 16 m; words on a dark chip over whoever was struck for each blow and what it
  came to (its damage, Blocked, Parry, Riposte, Counter, Perfect dodge, Staggered, Guard broken, Slain, a foe's Feint),
  gold or green when it is good for the player and red when bad; in first person, words about the player under the
  crosshair; an arrow at the screen's edge toward a foe out of view that swings, winds up or draws at the player; over
  a foe at a blow at the player that can be parried, a ring closing onto a fixed one exactly as the blow lands, gold
  once a press of the guard would parry it (never while the player's guard could open no window: a ranged weapon in
  hand, or hard on the heels of a parry missed) ([[Foes Show a Closing Parry Ring]]), and over one winding up an iron blow
  a red mark with no ring; a figure a blow harms flashing white for a tenth of a second, red for the player's own
  ([[Struck Figures Flash, and DFO's Blood Comes Over]]); a red edge when the player is struck; and, while the player lies dead, how long until they stand again at the start, or,
  with `?room=`, that the link to the room was lost and why.
- **Presses.** Every press of the swing, the guard or the dodge reaches the fight's rules, even one let go within a
  frame; a press of one guard key while the other is held is a fresh press, so it can parry. The swing's stroke is
  rolled among those that reach the locked foe. Alone, Escape pauses the fight.
- **Others.** Foes and other players are drawn between the room's snapshots along a clock that runs at the frames'
  pace, a snapshot's span and a tick behind the newest (two ticks while the room sends one a tick), so a frame that
  takes no new snapshot, or two, still moves them on at their own pace, whatever the screen's rate.

## Playing together

With `?room=` and a room's name in the page's address (`?room=playtest`), the Test Ground joins that room on the
deployed [[Server]]: everyone who uses the same name is in the same room. A name is letters, digits and hyphens, in
any case. A whole address joins another server's room instead: locally, under `npm run server`,
`?room=ws://127.0.0.1:8787/room/<name>`. The player plays as before, predicted here: each
tick's controls and fight's buttons also go to the room, and the room's word on the player's fighter corrects it. Foes
are the room's, the same for everyone in it, and fight whoever is near. Every other player in the
room stands where the room last saw them, dressed as they dress themselves, showing the move and frame their own
screen shows: their weapon drawn or worn, their swings, their casts, the moves played from the panel, and their horse.
Where the forge does not draw that move for their figure, it plays the move their body is in. The status line says
which player this is.

## What the figure shows

The player's figure shows the move the forge draws for what the body does:

- **On a wall or a ledge:** the mantle and vault by their progress; the hang, or the shimmy while moving along the
  lip; the climb, held on its first frame while still.
- **In the air:** the jump's rising, top or falling frame.
- **Mounted:** the horse's rest, walk or gallop.
- **Acting:** the cast. A swing strikes one of the owner's blows where the forge draws it with both hands' things: its
  stroke by the swing (down the overhead, up the thrust, any other the side cut) and its hold by the weapon (a sword,
  dagger or mace in one hand; an axe, flail or warhammer on its haft; a blade or mace in each hand as a pair). A blow's
  nine frames hold the first until halfway to the blow, run the first four through the last half of that time, show
  the fifth as it lands, and run the rest over a third of that time after. Where no blow
  is drawn, a swing plays one stroke of the weapon's attack, frames 0 to 2, and the next swing frames 3
  to 5. The stroke's frames run through the last half of the swing's wind-up so its last lands with the blow, two
  fifths of the way through a swing by DFO's swing law (a sword's in 0.4 s), and it is held through the
  follow-through: the figure strikes fast and shows itself open while it recovers. A foe's and another player's do the same. A weapon held alone thrusts when swung up, chops when swung down, and swings two-handed when swung left or
  right, where the forge draws it in those. A pair's blows are its two hands' strokes. A shot plays the weapon's own
  move whole, a brace's right then left, then its reload where the forge draws one.
- **Otherwise:** crouching, running, or the weapon's own walk and rest. A bow, a crossbow, a staff and the guns each
  have their own. A gun or a crossbow drawn runs with its own run, held at port arms. A bow drawn stands, walks and
  sprints in its own holds, both hands on it, where the forge draws them; else it rests in the left fist.

The left hand decides the stance. A shield or a torch there guards, marches and slashes; a blade there fights as a
pair. Each holds only where the forge draws both hands' things in that stance's attack. Otherwise the right hand's
weapon keeps its own moves and the left hand's thing is worn.

In any move, a weapon or shield the forge does not draw in hand is worn on the body for that move.

Walking frames last 0.25 s, running 0.125 s and crouching 0.5 s. A swing lasts 1 s. On a wall or a ledge the weapon is
worn, since both hands hold on. The figure faces where it moves and keeps that facing when still. While the soft lock
holds a foe, a figure on foot faces it however it walks, so walking away backs off from it
([[Locked On, the Figure Faces Its Foe]]). Swinging or casting, it turns to face where the camera looks.

## Dressing

The panel lists the figures. The player is first; the others stand where they are placed, each playing a chosen move
in a loop. For the chosen figure it sets:

- **Body and race:** Human with a skin tone from light to deep, Felid or Anole ([[Three Races]]).
- **Hair:** a style and its colour.
- **Armour:** a set for each piece, or one set for all.
- **Clothes:** worn in the order they are ticked, each in one of Daggerfall's dyes.
- **Hands:** what is in each hand, and whether it is drawn. The left can carry a torch, or a lantern, which only the
  first person draws.
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
its pack by its byte range and decoded once; one that fails to arrive is asked for again 5 s later, not every frame.

A frame is composed in the browser as DFO's game composes it (`composeFrame`):

- Each layer's cell is laid on the figure's cell by its root.
- At each pixel the nearest texel shows. Where two layers meet on one part of the body, the one with the higher order
  is drawn over the other: armour over cloth by its cover, a drape and a worn weapon by `under`.
- The bare body takes the race's skin or the human tone. Hair takes its colour's ramp. A metal layer's grey takes its
  set's metal and a garment's grey its dye, each a run of Daggerfall's palette.
- Then every texel is snapped to the nearest colour of the palette.

The view shown follows the turn between the figure's facing and the eye, and the three side views past the back are
the other side's, mirrored. A mirrored view with nothing in hand wears each hip piece (a sword's or dagger's sheath, a
Pistolet's) at the other hip first, so the mirror lays it back at its own; the forge draws a twin of each for that. Each frame stands upright on the figure's feet at 62 pixels a metre, turned to face the
eye. Its card stands a body's radius, 0.35 m, in front of the
body's centre toward the eye, so a wall the body touches, or a lip it is going over, does not cut through the flat
picture.

## Limits

- A figure is drawn as one flat card, so two figures that overlap are ordered as whole cards, not pixel by pixel.
- The course's blocks are the only things to climb, and the climbing does not tire.
- Composed frames are kept on the GPU up to 4,000, then all are let go and composed again as needed.
- The player's likeliest moves are composed ahead, two frames a tick: its rest, walk and attack, its strokes, the run,
  the jump and the crouch. A move not composed yet shows the last frame until it is.

## First person

In first person the player sees what they hold, swung, fired and carried as DFO plays it ([[First Person]]). The page
hands it the attack button and the player's state each frame, and plays the move it reports on the figure seen from
outside: a pair's blows are its two hands' strokes, one weapon's swings alternate its two strokes.
