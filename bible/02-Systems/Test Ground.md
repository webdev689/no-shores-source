---
type: system
status: live
code:
  - client/testground/index.html
  - client/src/testground/testgroundMain.ts
  - client/src/combat/worldSounds.ts#WorldSounds
  - client/src/testground/aimPanel.ts
  - client/src/testground/statusPanel.ts#startStatusPanel
  - client/src/testground/artsPanel.ts#startArtsPanel
  - client/src/combat/attackFeel.ts#AttackFeel
  - client/src/testground/feelPanel.ts#startFeelPanel
  - client/src/combat/swingArcs.ts#SwingArcs
  - client/src/combat/swingCourse.ts#courseOf
  - client/src/combat/swingMesh.ts#layStreak
  - client/src/combat/swingLook.ts#SWING_WGSL
  - client/src/combat/lightLayer.ts#LightLayer
  - client/src/combat/hitStop.ts#HitStops
  - client/src/combat/cameraKick.ts#CameraKick
  - client/src/combat/lunge.ts#lungeOf
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
  - client/src/combat/fightBlood.ts#FightBlood
  - client/src/testground/panel.ts#startPanel
  - client/src/player/foeDress.ts#foeDress
  - client/src/combat/foeBars.ts#FoeBars
  - client/src/combat/hudSheet.ts#wearFightSheet
  - client/src/combat/vitals.ts#Vitals
  - client/src/combat/tracers.ts#Tracers
  - client/src/combat/gunLooks.ts#GunLooks
  - client/src/combat/shotMarks.ts#ShotMarks
  - client/src/combat/glints.ts#foeGlints
  - client/src/combat/markOrder.ts#MarkOrder
  - client/src/combat/markDraw.ts#MarkDraw
  - client/src/combat/playerFight.ts#PlayerFight
  - client/src/combat/foeFigures.ts#FoeFigures
  - client/src/combat/fightEffects.ts#FightEffects
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
| `1`, `2` | Draw the Melee loadout, or the Ranged ([[Gear]], "Loadouts"); a swap between them takes 0.4 s |
| Right click, held | Swing; holding swings again. A swing readies a weapon put away. With a bow, a crossbow or a gun drawn: aim, over the shoulder or down the weapon's side, a bow charging |
| Left click, held | Guard; pressed just as a blow lands, parry. With a bow, a crossbow or a gun drawn: fire, a quick shot at the locked foe, or the aimed shot onto the crosshair; holding fires again as it reloads |
| `V` or Mouse5 | Dodge the way you move, or straight back |
| `R`, `Q`, `G` | Cast the worn Art's Anima, first Tenet and second Tenet, each once ready ([[Arts]]). Shadow's Dusk Daggers aims while `Q` is held, a ring on the ground at the crosshair, and casts as it is let go |
| `,` | Mount or dismount: 6 m/s, galloping at 12 with `Shift` |
| Wheel, Mouse4 | Pull back into third person and further, or come back into first person; Mouse4 switches straight |

Third person starts 2 m behind the head and 0.5 m up, and each wheel notch moves it 0.2 m, up to 10 m. Nearer than
0.8 m, the next notch returns to first person. The camera eases into place in about a tenth of a second, stops
short of a wall and keeps 0.25 m over the ground. Aiming a ranged weapon, it eases behind the right shoulder, 0.8 m out, 3 m back and 0.25 m up from
the head, and zooms in 1.3 times ([[The Third-Person Aim Stands 0.8 m Out and 3 m Back]]); in first person the view zooms in 1.6 times, the hands with it
([[Aiming Sits Behind the Shoulder and Zooms the View]], [[First-Person Aiming Zooms the Weapon With the View]]).

The panel's **Third-person aim** places that view by hand: sliders for how far right of the head it stands (left below
zero), how far behind and above, and its zoom. A ticked **Hold the aiming view** keeps the camera there, with the
crosshair, while the sliders move, without a weapon drawn. The place is kept in the browser, and its numbers are
shown to copy into the game's own (`AIM` in `playerCamera.ts`); **Back to the game's** returns to them.

North of the start is a course: steps, a low thin wall to vault, a crate to mantle, a 2.3 m ledge to catch on a jump and
shimmy along, a 4 m wall to climb, and stairs up to a platform. The blocks have a darker line at each metre of height.

## Fighting

The Test Ground plays the [[Combat]] rules in a room, always: alone, the room crate itself runs in the page's
WebAssembly; with `?room=`, a server's. The page predicts the player's fighter by the room's own rules and takes the
room's word for it, so playing alone and online are the same game. The [[Game]] fights on foot by the same modules:
the player's fight (`PlayerFight`), the foes' figures (`FoeFigures`), the fight's effects and blood, and the display.

- **Sounds.** The world's sounds play here as on foot ([[Interface]], "World sounds"), from the first click into the
  view, at full volume: the course's crate is wood underfoot, its other blocks stone. A cue not yet picked is silent.
- **Foes.** The panel picks a faction, then one of its types (marked land or deck), then one of the ranks that type
  comes in, the level it stands at (0 for none, which fights by combat's own numbers) and a Blaze, Volt or Cosmic
  shield if one is picked ([[Gear]], "Elements and shields"); Spawn stands it 5 m ahead of where the player looks,
  facing them, at most twelve, and Clear sends every foe away; a foe asked for while the forge still loads is not asked
  for. Names, factions and hands come from the rules' roster through WebAssembly. Each fights by its brain ([[Foes]])
  and wears its type's dress ([[Enemies]]): the Grey Tithe in grey over leather or iron, the pirates as the foes of
  each kind were dressed before.
- **Statuses.** The panel gives any status ([[Combat]], "Statuses") to the player or to every foe, from the player,
  for its own time or for as many seconds as asked (ten minutes at most), through the room's own door, as a spell or a
  perk will: the icons show on the foes' plates and under the vitals, and the rules act on them. Only a course's room
  grants them; a node's refuses.
- **Arts.** The player joins with every Art at level 5 owning every fragment. The panel wears an Art, sets each slot of
  its Core and each Art's level (a row of buttons, 1 to 5: a press sets that level, the one shown too, and owns every
  fragment of that Art again), showing the room's word on all of them, and a button fills
  the Anima and readies both Tenets at once, so every spell can be tried in turn ([[Arts]]). After each ask the room's
  next word sets every list back to what it holds, so a choice it refused does not stay shown. The ability bar stands at
  the bottom left, beside the weapons. An Anima's release pushes the view in and frames the screen in its element, as in
  the game.
- **What figures show.** A fight holds a figure to the forge's own moves: the death and then lying fallen; fallen when
  knocked down; hurt while staggered or flinching; the dodge roll through a dodge, on the ground and in the air, no
  weapon seen through it, held or worn, as the forge draws none in the roll (where the forge draws no roll, the jump's
  rising, top and falling frames through the dodge's hop, or the run where it does not draw what is held in the jump);
  the parry's deflect, or a shield's block; the guard held as the parry's first frame or a shield's block; a telegraphed
  blow's stroke raised through its wind-up and held at its end when it overreaches. A ranged weapon aimed, standing or
  walking, is held on the frame before the one its shot leaves on, aimed or drawn as it fires but without the flash or
  the slack string: a thunderlock's or a pistolet's second frame, a brace's first (its right pistol aimed), a bow's or a
  crossbow's second, a bow drawn to it over its first. Loosed, the shot plays on from that frame, its flash or loose
  shown as the first person's shot leaves, a brace's left raised and then fired. A foe's aimed shot is drawn through
  its wind-up and held the same way, in its own weapon. A foe's swings are its stroke's frames, by its weapon, landing
  their last with the blow.
- **The ground.** A telegraphed blow's shape is marked on the ground where it lies: gold, red when iron, its edge
  drawn at once, four figure pixels wide with a dark line outside it, and its fill growing with the wind-up, a
  quarter of its cells dithered whole on the ground, each cell four figure pixels square. In its last fifth of a second the fill keeps half its cells, and for its first
  three ticks the edge is white-hot. An iron one has a second edge inside the first, so it reads without its colour,
  and "Dodge!" floats over a foe near the player as it begins one; its foe is outlined iron red for that last fifth.
  At 80% of a foe's wind-up, telegraphed or a plain swing, a star of steel flashes on its weapon for 4 ticks, red for
  an iron blow. Arrows and bolts are drawn in flight: a steel head, a wooden shaft and pale fletching.
- **Tracers.** Every shot draws a tracer, a white-hot core in a wider glow, solid and never thinner than 2 and 4
  pixels at 720p. A ball's head races from the muzzle to where it stopped at 350 m/s as a glint, a 6 m streak behind
  it and a thin trace back to the muzzle, then breaks into pieces over 0.32 s, fewer each quarter. A gun's shot
  flashes a star of fire at its muzzle, then tongues of flame along the barrel, then sparks, lighting the ground under
  it for two frames, and leaves five puffs of smoke that rise, drift the shot's way and thin out over 1.2 s; its
  sizes are held to a share of the view, so first person's flash stays small. An arrow or a bolt trails the last
  0.3 s of its falling flight, its tail broken up. The player's own shots draw at once from the
  weapon as drawn, the first person's muzzle in its firing frame or the figure's along the shot, joining the shot's
  true flight within 0.15 s; one the room's word makes an input fire that it had not first predicted draws as that word
  comes. Others' come from the room's word, each ball's line from the one snapshot that carries it; a foe's ball, which
  flies, is one tracer whose head keeps its own speed a tick behind the room's word, with one flash at its muzzle,
  until the snapshot that says it stopped, with the point it left its gun: then its head runs on to where it stopped.
  A ball first seen where it stopped is drawn from that point. One no snapshot carries on for a second, its shooter
  sent away, is dropped with no sparks. Where a shot comes to rest it shows what it struck: a ball's flash; a star on
  a body; dust and, for a ball, a hole on the ground for 8 s; chips and ten sparks back the way it came on stone; a
  splash and a ring on the sea. An arrow or a bolt stays stuck where it stopped for 8 s, in a body for as long as the
  body stands; the 24 newest are kept.
- **How marks are drawn.** Solid marks (whole, or dithered whole on the ground) write depth, so a near one hides a
  far one; the see-through rest is drawn after them, each triangle far to near from the eye.
- **Blood.** Each hit sprays [[Blood]] from the struck body's chest onto the ground and the blocks, a player's swing
  throwing it the way the blade went; a wounded body drips a trail, and a dead one lies in a spreading pool.
  `?blood=off` draws none.
- **Where blows land.** Every blow that lands, every clash of steel and every kill shows where it happened, as the
  [[Game]] shows it: a star, a ring, a slash, sparks and bursts, a crit's gold, a kill's dust and chips, and an
  elemental kill's finisher ([[Arts and Loadouts as Claude Shapes Them]], "How attacks look"). Sparks are two figure
  pixels thick and cool a whole stop at a time.
- **The attack feel.** Four effects over the fight's blows, each switched on or off and set by a slider in the panel's
  **Attack feel**, kept in the browser with its numbers shown to copy
  ([[The Attack Feel Is Tried in the Test Ground]]). Only the drawing moves: the fight's rules and their clock never
  do. The game plays the same four at the panel's defaults ([[Game]]).
  - *Swing arc.* A streak of light along each blow's path, laid from the rules' own landing, reach and width, going the
    way the striker's figure is drawn swinging
    ([[First Person Strikes Faster Without Arcs, and Arcs Follow the Drawn Blow]]). A blow goes its own way, whatever
    way the swing was asked: the overhead down, the thrust out, the side cut across to the left in every hold, from
    the right shoulder, as the forge's captured clip draws it. Any other move goes the rules' stroke. A figure drawn
    mirrored swings left-handed, so its arc is mirrored too, as it was when the swing began. It sweeps as the figure is
    drawn striking: from a blow's last wind-up frame, the weapon at the top of its raise, through the landing on the
    rules' tick, to its last follow-through frame.
    An overhead comes down slanting from the striking shoulder, a sweep crosses a little wider than it strikes, a slant
    cuts down and across, and a thrust drives out and flares where it lands. It is pixel art: whole figure pixels in the
    four stops of a ramp, never blended. Each part steps down its ramp by how long ago the blade passed it and is drawn
    only where the blade went fast, so only the cut shows: the cutting edge white-hot over a dark rim, the blade's sweep
    in lanes that each trail their own length, the oldest fifth dithered out in a 4 by 4 order; a ribbon along the tip
    turns to the eye, so a cut seen edge on still shows; the head is a four-rayed star, a square block for a blunt
    weapon. It stands where its blade goes, so its own striker's figure hides what passes behind it, as walls and
    figures nearer the eye do: from behind, an overhead, a slant or a thrust shows only round its striker
    ([[The Swing's Arc Never Covers Its Striker]]). Its ramp is the blade's element where the hand glows, gold for a riposte or a
    counter (`#4a2a06`, `#c8901e`, `#ffd95a`, `#fff6d0`), else its metal's, made from the metal's light (daedric red,
    steel blue, dwarven gold), and the element leaves the blade along it ([[Weapon Glow]]). Its weight is the weapon's
    class: a dagger's sweep 0.7 times a sword's wide and long, a mace's 1.2, a flail's 1.4, an axe's, a warhammer's and
    a greatsword's 1.6 wide and 1.4 long with a 0.25 m head, its ribbon widened by the root of that (seen edge on, a
    heavy one would fill the view); and an overhead of a flail, an axe, a warhammer or a greatsword strikes the ground
    where its head meets it in the follow-through: a crack of three rays stepping 4, 3 and 2 pixels wide, 0.6 m each,
    lit in the arc's ramp for its first frames, then dark until it thins away at 0.9 s, and 12 chips of dust thrown out.
    For the first two frames of its strike, the striker's own figure above its hips is drawn again 4 pixels back against
    the blade's way, behind it, in the ramp's second stop: a smear that trails the swinging arm. It follows the blow's
    aim as the rules turn it, flares where the blow meets something (meeting several, as brightly as the most it came
    to), stops where a flinch or a dodge cuts it short, and waits while the fight waits. None is drawn through the eyes.
    Brightness and trail are set.
  - *Hit-stop.* As a blow lands, its striker and the one struck hold still (a block 0.05 s, a hit 0.075 s, a parry
    0.08 s, a stagger 0.09 s, a guard broken or a crit 0.11 s, a kill 0.16 s; a blow that harms nothing, or a shot,
    holds nothing), from the frame after it lands, so the landing is what holds; the one struck shudders. Then they catch
    up at 1.6 times, never more than 0.2 s behind, and the player's hands go back to the rules' clock as what they do
    changes. Other players' figures, drawn from their own looks, are not held. Its length is set.
  - *Camera kick.* The player's blow landing punches the view down and along the stroke and shakes it a little, harder
    for a kill, a stagger or a guard broken; a blow of theirs stopped by a guard knocks the view back; a blow landing
    on the player jolts it and shakes it as hard as the harm; and the view leans into their own swing as it lands. A
    blow's hit and the kill it made punch once, as does one stroke however many it strikes, as hard as the hardest; a
    shot kicks nothing; while a crosshair shows, the kick moves the view but never turns it, so the crosshair stays
    where shots land. Its strength is set.
  - *Lunge.* The striker's figure drives into its blow and settles back: a thrust 0.32 m, an overhead or a slant 0.2 m,
    a sweep 0.14 m; through the eyes, the eye goes half as far. Its distance is set.
  - *Light.* The brightest effects light what stands round them, stepped like the figures. The marks and the arcs are
    drawn again into a picture a quarter of the view's size each way, hidden where the scene stands more than 3%
    nearer. A colour gives light only past a brightness (luma) of 0.7, the more the brighter: an element's light and
    white-hot stops, a metal's white edge, gold's light. A dark or body stop gives none, and so does a mark lying on the
    ground (a telegraphed blow's), a drop's line, a muzzle's pool and a heavy blow's dust. That picture is blurred twice
    by a 3 by 3 box, tripled, cut to none, half or all of each colour, and added over the view in blocks of 4 screen
    pixels, 0.35 at most, before the first person's hands. A white-hot effect's halo is a block of full light past its
    edge, a light stop's a block of half; a lone spark lights nothing. On as made, as the game plays it.
- **The crosshair.** While a ranged weapon aims, and whenever the Ranged loadout is drawn in first person (read from
  the outfit shown, the pointer held or not), a crosshair marks the view's middle, where an aimed shot lands; a bow
  aiming rings it with its draw, gold once at full power. The shots left stand beside it while it shows ([[Interface]]).
- **The display.** It lays its own sheet over the [[Interface]]'s kit. The compass across the top's middle, turned with
  the view; health, stamina and poise as long thin pointed bars at the top left, a faint strip holding what a loss took
  before it drains, the health's frame flashing blood at a quarter or less and the stamina's flashing when a swing or a
  dodge is pressed with none; the Arts and the weapons in hand and in the other loadout at the bottom left; the soft
  lock's target marked at its chest; the target's plate (level, name, health and poise track) under the compass (below
  the boss bar while one shows); over each living foe but a Boss, near the crosshair or fought in the last minute, its
  plate: its level, its type's name with an Elite's or a Miniboss's mark, and its health in red, orange or yellow by
  rank, a "?" while it is suspicious or searching and a "!" for a second as it turns alert, no plate over another's;
  under the compass, for the nearest living Boss alert or struck, the boss bar: its level, name and faction, "Phase n of
  3", and its health in yellow marked at 2/3 and 1/3 ([[Enemies]]); words where each blow met the body for each blow and
  what it came to (its damage, Blocked, Parry, Riposte, Counter, Perfect dodge, Staggered, Guard broken, Crit, Slain, a
  foe's Feint), gold or green when it is good for the player and red when bad, those said together (a stroke over each
  foe it struck) each standing clear of the rest; in first person, words about the player under the crosshair; an arrow
  at the screen's edge toward a foe out of view that swings, winds up or draws at the player; over a foe at a blow at
  the player that can be parried, a ring closing onto a fixed one exactly as the blow lands, gold once a press of the
  guard would parry it (never while the player's guard could open no window: a ranged weapon in hand, or hard on the
  heels of a parry missed) ([[Foes Show a Closing Parry Ring]]), and over one winding up an iron blow a red mark with no
  ring; a figure a blow harms flashing ([[Struck Figures Flash, and DFO's Blood Comes Over]]) as the [[Game]] has it; a
  red edge when the player is struck; and, while the player lies dead, how long until they stand again at the start, or,
  with `?room=`, "Reconnecting…" while the page joins its room again, or that the room sent the player away and why.
- **Presses.** Every press of the swing, the guard or the dodge reaches the fight's rules, even one let go within a
  frame; a press of one guard key while the other is held is a fresh press, so it can parry. The swing's stroke is
  rolled among those that reach the locked foe. Alone, Escape pauses the fight.
- **Others.** Foes and other players are drawn between the room's snapshots along a clock that runs at the frames'
  pace, a snapshot's span and a tick behind the newest (two ticks while the room sends one a tick), so a frame that
  takes no new snapshot, or two, still moves them on at their own pace, whatever the screen's rate.

## Gear

The [[Gear]] panel, at the right, shows the player's gear as the room holds it: their level, Prestige, Defense, XP,
Aurem and each stack they hold any of; what they wear and carry, each item's Attack, Defense or Prestige, level and
XP; each item's nodes, column by column, bought and chosen, with what a node costs or the XP it waits on; their
Vestiges, those lying for them on the ground, and the vault; and the answer to their last ask.

- **Asks.** Its buttons wear an item in its slot, take one off, buy a node or choose among
  those bought, dismantle, identify a Vestige, put into the vault and take out, and gather; a Fruit of Dagon is fed to
  an item by holding its button. While the mouse is free the room in the page waits, but an ask still goes: the room
  runs on, the player standing still, until it has answered, a second of its time at most, so each answer shows at
  once. A refusal says why.
- **The stall** stands south-east of the start, ringed in brass on the ground: within 4 m of it a Vestige opens and
  the vault is reached, as in a social space.
- **Resource nodes** stand west of the start, ringed in sea green, two of Saltmere's Brineglass and one of
  Cairnwatch's Cairn Iron; within 2.5 m one is gathered, and dims once spent.
- **Drops** a kill leaves (a Vestige, an Ammo box, an Ammo crate) are thrown out of the foe and stand as their own
  pictures under their lines, as in the game ([[Gear]], "Drops"), and are taken by walking over them.
- **The hands** hold what the gear wears: the room takes no other arms. So the player's own hands in the dress
  panel pick a Melee and a Ranged kind, and picking one wears it: the first carried that they may wear, or a Normal
  one of their level handed out. Each picker shows what is worn, so a refused pick shows the kind still worn. Their
  Left picks a torch or a lantern, held wherever the room's arms allow it beside the loadout drawn ([[Gear]], "In
  the rooms"); beside a shield, a second weapon or a greatsword's grip, the loadout's own left is held.
- **Hand out**, to try the loop without playing it through: a Vestige of any colour for any slot and level, a lesser
  item of any kind, rarity and level, any named item, 50 of every material, and XP; and ammunition full or none, five
  Ammo crates, and one used. The panel shows the shots left and the crates carried; with no Ranged weapon worn, the
  share of a full load kept for one.

The room in the page runs one tick as the page opens, so the gear is there before the player first plays.

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
which player this is. A foe an older room sends with no type is drawn as the pirates' type in its role.

When the room's socket closes, for a deploy or a dropped network, the page joins the room again by itself ([[Server]],
"The browser's side"): a new player there, standing where the room puts them, their dress and what their hands hold
kept and sent again.

## What the figure shows

The player's figure shows the move the forge draws for what the body does:

- **On a wall or a ledge:** the mantle and vault by their progress; the hang, or the shimmy while moving along the
  lip; the climb, held on its first frame while still. A foe's glance carries no progress, so the page reckons it by
  the movement rules' law from the time since its glances showed it begin and the height it has risen: a mantle's
  exactly, a vault's a little ahead until the top of its arc.
- **In the air:** the jump's rising, top or falling frame.
- **Mounted:** the horse's rest, walk or gallop.
- **Acting:** the cast. A swing strikes one of the owner's blows where the forge draws it with both hands' things: its
  stroke by the swing (down the overhead, up the thrust, any other the side cut) and its hold by the weapon (a sword,
  dagger or mace in one hand; an axe, flail or warhammer on its haft; a blade or mace in each hand as a pair; a staff in
  both hands). A blow's nine frames hold the first until a quarter of the way to the blow, run the first four through
  the last three quarters of that time, show the fifth as it lands on the rules' tick, and run the rest over a little
  over half that time after ([[Third-Person Strikes Run Faster Than DFO's]]); while the swing runs out, a figure
  standing holds the last, and one on the move walks on. Where no blow is drawn, a swing plays one stroke of the
  weapon's attack, frames 0 to 2, and the next swing frames 3 to 5. The stroke's frames run through the last three
  quarters of the swing's wind-up so its last lands with the blow, two fifths of the way through a swing by the swing
  law (a sword's in 0.3 s, [[Combat]]), and it is held through the follow-through: the figure strikes fast and shows
  itself open while it recovers. A foe's and another player's do the same. A weapon held alone thrusts when swung up,
  chops when swung down, and swings two-handed when swung left or right, where the forge draws it in those. A pair's
  blows are its two hands' strokes. A shot plays the weapon's own move whole, a brace's right then left, then its reload
  where the forge draws one. While the body moves on the ground, a blow, a shot, a reload, a ranged weapon aimed and the
  cast play their own on the move, the legs walking under the action, wherever every layer the figure stacks in the
  action is drawn walking too; standing, or where any is not, the action's own. A foe's and another player's do the
  same.
- **Otherwise:** crouching, running, or the weapon's own walk and rest. A bow, a crossbow, a staff and the guns each
  have their own. A gun or a crossbow drawn runs with its own run, held at port arms. A bow drawn stands, walks and
  sprints in its own holds, both hands on it, where the forge draws them; else it rests in the left fist.

The left hand decides the stance. A shield or a torch there guards, marches and slashes; a blade there fights as a
pair. Each holds only where the forge draws both hands' things in that stance's attack. Otherwise the right hand's
weapon keeps its own moves and the left hand's thing is worn.

In any move, a weapon or shield the forge does not draw in hand is worn on the body for that move.

Walking frames last 0.25 s at a full walk, 4.43 m/s, and as much longer as a walk is slower, so a stroll's feet keep
to the ground; never shorter. Running frames last 0.125 s and crouching 0.5 s. Each figure plays its loops on from
the frame it shows, so a walk that slows never jumps a frame. On the ground a foe's pace is read over its last 0.1 s,
so a tick the rules hold it still between steps shows no stand. A sword's swing lasts 0.75 s. On a wall or a ledge
the weapon is worn, since both hands hold on. The figure faces where it moves and keeps that facing when still. While
the soft lock holds a foe, a figure on foot faces it, walking or still, so walking away backs off from it; sprinting,
it faces where it runs, and its foe again once the sprint ends ([[Locked On, the Figure Faces Its Foe Unless It
Sprints]]). Swinging or casting, it turns to face where the camera looks. Dodging, a
figure (the player's, another player's or a foe's) faces the way its hop goes, so its roll is drawn going that way,
though the rules keep the fighter facing its foe ([[A Locked-On Dodge Rolls the Way It Goes]]).

## Dressing

The panel lists the figures. The player is first; the others stand where they are placed, each playing a chosen move
in a loop. For the chosen figure it sets:

- **Body and race:** Human with a skin tone from light to deep, Felid or Anole ([[Three Races]]).
- **Hair:** a style and its colour.
- **Armour:** a set for each piece, or one set for all.
- **Clothes:** worn in the order they are ticked, each in one of Daggerfall's dyes.
- **Hands:** what is in each hand, and whether it is drawn. The left can carry a torch, or a lantern, which only the
  first person draws. The player's own pick a loadout to wear, and a light ("The hands", above).
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
its pack by its byte range; a body shorter than its range is fetched once more past the cache, never decoded. One that
fails to arrive is asked for again 5 s later, not every frame. Decoded strips are kept while there is room: 128 MB in
the worker that composes the figures, 96 MB on the page, the least lately asked for let go and fetched again if asked.

A frame is composed in the browser as DFO's game composes it (`composeFrame`), in a worker off the page's thread (on
the page where no worker starts), so the page only uploads it. A move shown before it is composed asks for the rest of
its frames in that view with it. The worker composes the frames whose strips have come in the order they are wanted:
those shown now, then the rest of a move just shown, then those composed ahead (`ComposeQueue`). A frame still
waiting for its strips holds up none of the others, and one under way that is now shown goes ahead. A frame that
fails is asked for again 5 s later, not every tick. Each frame is composed so:

- Each layer's cell is laid on the figure's cell by its root.
- At each pixel the nearest texel shows. Where two layers meet on one part of the body, the one with the higher order
  is drawn over the other: armour over cloth by its cover, a drape and a worn weapon by `under`.
- The bare body takes the race's skin or the human tone. Hair takes its colour's ramp. A metal layer's grey takes its
  set's metal and a garment's grey its dye, each a run of Daggerfall's palette.
- Then every texel is snapped to the nearest colour of the palette.

The view shown follows the turn between the figure's facing and the eye, and the three side views past the back are
the other side's, mirrored. A mirrored view wears each hip piece (a sword's or dagger's sheath, a Pistolet's) at the
other hip first, and puts what each fist holds in the other fist, so the mirror lays each back on its own side. The
forge draws each hip piece's twin in every move, but a weapon's twin in the left fist only in some: a sword, a dagger
or a mace through the run, the crouch and the jump, never the walk, the rest or a blow. Where a fist's twin is not
drawn, both fists keep the plain mirror, so the weapon is seen in the other hand; where a hip has a piece with no
twin (the quiver), both hips keep it. Each frame stands upright on the figure's feet at 62 pixels a metre, turned to face the
eye. Its card stands a body's radius, 0.35 m, in front of the
body's centre toward the eye, so a wall the body touches, or a lip it is going over, does not cut through the flat
picture.

## Limits

- A figure is drawn as one flat card, so two figures that overlap are ordered as whole cards, not pixel by pixel.
- The course's blocks are the only things to climb, and the climbing does not tire.
- Composed frames are kept on the GPU up to 4,000. Composing ahead fills them up to that and never past it; frames a
  figure asks for go past it, and then the least lately asked for are let go down to 3,000 and composed again as
  needed. A frame composed ahead and let go before it was asked for has its dress composed ahead again, into the room
  let go.
- Each figure's likeliest moves are composed ahead, four frames a tick in all (two when composing on the page), from
  one queue in which a figure's new dress replaces only its own frames still queued, passing over frames kept already:
  every view as drawn and as mirrored, its rest, walk and attack, its strokes, each blow, shot and reload on the move,
  its guard or a shield's block, its hurt, the roll, the run, the jump and the crouch; the player's other loadout's
  too, so a swap shows it at once. A move not composed yet shows the last frame until it is: its strips take most of a
  second to come the first time, then its frames follow in the order they play. A crowd of many dresses (the player,
  the other loadout and five or six foes' dresses) holds more than 4,000 frames, so the last dresses are composed
  ahead only as room comes.

## First person

In first person the player sees what they hold, swung, fired and carried as DFO plays it ([[First Person]]). The page
hands it the attack button and the player's state each frame, and plays the move it reports on the figure seen from
outside: a pair's blows are its two hands' strokes, one weapon's swings alternate its two strokes.
