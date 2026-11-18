---
type: system
status: live
code:
  - client/src/plus/kit.ts#ROLES
  - client/src/plus/kit.ts#kitCss
  - client/src/plus/kit.ts#wearKit
  - client/src/plus/frame.ts#frameSvg
  - client/src/plus/tones.ts#TONES
  - client/src/plus/tones.ts#FILLS
  - client/src/plus/emblems.ts#emblemUrl
  - client/src/plus/barLayout.ts#BarLayout
  - client/src/plus/barLayout.ts#PLATES
  - client/src/game/hud.ts#Hud
  - client/src/combat/hudSheet.ts#wearFightSheet
  - client/src/combat/hudSheet.ts#HALO
  - client/src/combat/hud.ts#veilOf
  - client/src/combat/hud.ts#clearOf
  - client/src/combat/vitals.ts#Vitals
  - client/src/combat/foePlate.ts#FoePlate
  - client/src/plus/barLoss.ts#stepLoss
  - client/src/plus/barLoss.ts#pieceAt
  - client/src/combat/foeTarget.ts#FoeTarget
  - client/src/combat/foePlate.ts#poiseTrackOf
  - client/src/combat/plateSight.ts#coneWant
  - client/src/combat/plateSight.ts#plateScale
  - client/src/combat/plateSight.ts#PlateSight
  - client/src/combat/hitWords.ts#wordsOf
  - client/src/plus/kit.ts#motionReduced
  - client/src/ships/shipBars.ts#drawShipBars
  - client/src/ships/shipBars.ts#HullLosses
---
# Interface

The game's screens wear Enhanced Plus, DFO's own interface, brought over and adapted ([[Pick - Enhanced Plus UI]],
[[The Ship Is Managed and Walked From the Sea's Panel]]): carved stone and brass, so every surface reads as one stone.

## How it works

- **Roles.** Every surface plays a role, and the role says how it is painted and how it answers a press: a window
  (the carved frame with brass fittings at its corners, a grained ground, a hard drop), a button, a primary (the one
  press a surface is for, in brass), a chip (a readout), a header, a footer, a rule, a rail, a track (a bar's dark
  trough, sunk into its edge, a hairline at 1 px) and a meter (a bar's fill, lit along its top, shaded along its foot,
  its leading edge lit, in the colour its surface gives it). A surface takes its role by taking its class (`ROLES`); a
  role no surface wears yet comes over from DFO's kit when one does.
- **Presses answer alike.** A button or primary is raised stone; it goes brass under the pointer or focus, sinks while
  held and goes flat when it cannot be pressed.
- **Paint only.** The kit writes colours, bevels, grounds and shadows, never a width, padding or size, so dressing a
  surface never sizes or spaces it; only a held press sinks a pixel. The page's own sheet gives each surface its
  room, and each window and press the 2 px border the kit's bevel and frame land on.
- **The frame** is a 25 px square picture drawn pixel for pixel and used at 1:1: the outline, the stone bevel lit
  from the top left, an engraved line and a dark lip, with a brass fitting and its rivet at each corner. It reaches
  6 px outside its box, so it takes no room.
- **The palette** names each tone for what it is: the stone from lit to dark, the brass from lit to dark, the grounds
  and the words; and each bar's fill (`FILLS`): red, orange and yellow by rank, and the three vitals.
- **Emblems and marks** are our own pictures, drawn pixel for pixel in the palette and shown at whole multiples: the
  Grey Tithe's balance in grey stone and the pirates' skull in bone over crossed brass bones, by faction number; an
  Elite's brass chevron and a Miniboss's two.
- **Bars over figures never overlap** (`BarLayout`). Each frame the nearest keeps its place over its figure, in front,
  and each farther one that would cover a bar already placed is lifted just above it. The order changes only when a
  figure comes 6% nearer, a lifted bar comes down only once it is 10 px further clear, and a bar eases to a new height,
  so the bars hold still from frame to frame.
- **Where it is worn.** The [[Game]]'s heads-up display lays the kit's sheet once. The sea bar is a window, its groups
  (Navigation, Pace and Ship) parted by rails; the dock or landing offer, Take the helm and Respawn are primaries;
  the status line is a chip; the menu is a window under a header.
- **Nothing covers another.** The fight's plates at the top (a boss's bar, the target's) and ships' plates in a
  sea fight take the top from the place's name, which gives way while they show. On foot the status line stands
  under the place's name; in a sea fight, under a Boss ship's plate. At sea the hints rise above the offer to dock
  or go ashore.
- **The fight's display** ([[Enemies]], [[Test Ground]]) lays its own sheet after the kit's, and its bars do what
  DFO's Enhanced UI Plus does with them ([[Pick - Enhanced Plus UI]]). The vitals are one window at the bottom left,
  three tracks in it, each naming itself and writing its percentage inside: never 0% while anything is left. Health
  at a quarter or less flashes its edge to blood; the stamina flashes white for a swing or a dodge asked with none.
  Whole and untouched for 4 s (health and stamina short of no whole point, no poise taken), with no foe on the
  target plate or the boss bar, the window rests out of sight in six steps over 1.2 s; the first point lost or spent
  brings it back in two.
- **A bar's losses.** After a loss a strip holds where the bar stood for 0.55 s (1.2 s at most however the losses
  keep coming), then drains at 70% of the bar a second: on a vital it is the bar's own colour, faint; on a foe's or a
  ship's, pale. A frame that takes a real bite (1.5% of a vital, 0.5% of a foe's health, 1% of a hull) breaks the
  span off as a piece that falls in two halves, each in eight hard steps to its turn and eight more down and away,
  fading (0.56 s, 0.64 s); two pieces fall in turn, so blows in quick succession each have their own. The vitals'
  health and stamina, the target plate, the boss bar and ships' plates break pieces off; the plates over figures and
  the poise do not.
- **The target plate** shows the foe the player is fighting: the one their blow last reached, the one their soft
  lock takes, or one beginning a telegraphed blow at them (unless they struck another in the last 2 s). It stands 6 s
  after the last of these, fading over the last 1.5 s, and goes at once when the foe dies; never the Boss the boss
  bar shows. It remembers the health it last showed of each foe, so one turned back to loses from where its own bar
  stood, and one first shown is taken as whole, the plate coming with the first blow. The boss bar remembers its
  Bosses alike, but takes one it first shows as it finds it, as it comes before any blow.
- **The poise track**, a thin bar under the target's and the boss bar's health: the poise filling toward a break in
  brass; an iron blow wound up, full and hatched in red, "Iron"; staggered, full and white, "Staggered", flashing as
  the foe it shows breaks and never as the plate turns onto one already staggered; open after a blow that found no
  one, a brass edge, "Open". With nothing to say it keeps its room unseen.
- **Plates over figures are never overbearing.** A foe's shows only within 20 degrees of the crosshair, whole within
  17 and none past 23, easing in and out over 0.25 s; a plate new on the screen starts where the cone puts it, so
  none pops in. The foes the player traded a blow with in the last minute show wherever they are. A plate shows
  for no foe farther than 60 m across the ground, nor one whose head the place's blocks have hidden for 0.15 s; seen
  again it comes back at once. It is whole as near as 12 m through a 60 degree lens and shrinks as its figure does
  farther off, never growing, its name never under 9 px.
- **A blow's words** over the world rise and fade over 0.95 s from where each thing happened, fanning up to 36 px
  either side so a flurry does not stack; a great turn's pops larger and rises farther. What a blow did besides
  (Staggered, Slain) rides on its number as a small word under it, and the player's blow on a foe winding up that
  does not break it says "Holds".
- **Reduced motion.** With it asked for, no piece falls, no word rises (each stands and fades), no edge blinks (it
  holds blood or white), no flash plays and plates over figures and ships go straight to their places.
- **Its layers**, back to front: what stands over the world (the plates over figures, nearest in front, the parry
  rings, the words, the arrows), then the plates fixed at the top, then the veil over the whole display: blood while
  the player lies dead, plain while the link to the room is lost or joining again. The display never stands over
  the page's own windows. An arrow to a threat off the screen that would fall on the vitals stands just above them.
- **Words** over the world or a fill (plates' names, the vitals' words, the veil's) carry a hard 1 px outline all
  round and a soft shade past it, as a ship's plate strokes its words (`HALO`), so they read over bright sky. The
  [[Game]]'s place name and hints, laid straight on the world too, carry the same outline.
- **A foe's plate**, after the owner's reference: its faction's emblem in a chip square at the left; to its right its
  name above a long thin track, the meter in its rank's colour. Over each foe, the soft lock's (with its poise under
  the health) and the boss bar's are this one plate at three sizes. Ships' plates are drawn alike on an SVG, at the
  same sizes (`PLATES`): 140 by 26 px over a figure, and the boss bar 640 px wide at most, three quarters of a
  narrower screen, its faction after its name. A ship's hull reads its losses as a foe's health does, and her bar's
  edge flashes for a bite, whole, two thirds and a third over 0.24 s; a ship first seen starts whole at her bar.
- **Manage's panel** is a window at the right under a header naming the ship. Each part's heading is a rule; a part
  still to come shows Later in a chip; Back to the sea stands on its footer. It is built again only when what it
  shows changes.

## Limits

- One look, DFO's Slate. Its other themes (Stone, Iron, Ember, Forest, Night) wait on a settings screen to choose
  them in.
- The [[World Editor]] and the [[Test Ground]] keep their own panels for now.
- The vitals always rest when whole: DFO's switch for it waits on a settings screen.
- Only the place's blocks hide a plate: the ground between does not, so a foe over a hill keeps its plate.
- A plate keeps its size on any screen; DFO's names also grew with the screen's height.
- Bars at the top of the screen (the boss bar, the soft lock's, a Boss ship's) stand where they are set; only bars
  over figures are laid apart.
- No gamepad or touch layer yet.
