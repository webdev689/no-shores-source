---
type: system
status: live
code:
  - client/src/firstperson/firstPerson.ts#FirstPerson
  - client/src/firstperson/firstPerson.ts#contact
  - client/src/firstperson/hands.ts#Hands
  - client/src/firstperson/handsLaw.ts#handsPlan
  - client/src/firstperson/weaponMachine.ts#WeaponMachine
  - client/src/firstperson/shotMachine.ts#ShotMachine
  - client/src/firstperson/fpFrames.ts#weaponPicture
  - client/src/firstperson/heldPictures.ts#gunPicture
  - client/src/firstperson/heldPictures.ts#flaskPicture
  - client/src/firstperson/riding.ts#RideMotion
  - client/src/firstperson/fpMotion.ts#Sway
  - client/src/firstperson/fpPlaces.ts#swayedQuad
  - client/src/firstperson/climbHands.ts#ClimbHands
  - client/src/firstperson/climbing.ts#climbPlace
---
# First Person

What the player holds in first person, from the [[Sprite Forge]]'s first-person pictures, as DFO plays it
([[The Player Plays as in DFO]]). The [[Test Ground]] hands `FirstPerson` the attack button and the player's state each
frame: what is in each hand, the gauntlets and boots worn, whether the hands are drawn, walking or running, the metres
walked, a cast, a climb, a ride and the look's bearing and tilt. It answers the blow that lands or the shot that leaves, and from
which hand, and reports the swing or shot under way, so the figure seen from outside plays a matching move.

## How it works

### What the hands hold

| In the hands | Drawn |
|---|---|
| A weapon or a bow in the right | That weapon; the left hand's thing beside it unless the weapon takes both hands |
| A one-handed weapon in each, or one beside a Pistolet or a crossbow | Both, the left mirrored about the screen's middle: a pair |
| Two Pistolets, or two crossbows | Both, each fired as it is loaded: a volley |
| A gun beside a crossbow, or anything beside a two-hander | The right one alone |
| A weapon in the left alone | That weapon, mirrored at rest and in the strikes down and up |
| A shield, a torch or a lantern in the left | It, beside a one-handed weapon or a fist |
| Nothing | Both fists up |

The two-handers are the staff, the warhammer, the battleaxe, the bows and the Thunderlock. The hands hold the loadout
drawn ([[Gear]], "Loadouts"): a pair's two blades or maces, an "& Shield"'s weapon and shield, a double pistolet's two
Pistolets as a volley, the Great Axe the battleaxe's pictures, and a Greatsword the sword's, held as a sword is.

A weapon in an element glows in it while drawn, each hand in its own weapon's ([[Weapon Glow]]).

### Swinging

A click swings once. Holding the button swings again as each blow ends. Out of a fight each blow takes one of six
directions at random: down, down and left, left, right, down and right, or up. In a fight, the game's or the
[[Test Ground]]'s, the [[Combat]] rules decide when a swing begins and its stroke, the chain's next ([[Combat]],
"Swings"), so the first person swings as the rules do; a swing the rules refuse (no stamina, a stagger) is not drawn. A
swing the rules begin once the last blow has landed starts the strike again, a pair's from the other hand, so no held
swing is lost to the frames' rounding; one the rules end early (a dodge, a flinch, a guard) ends in the first person at
once, and a bow's draw let go too soon to shoot is put away without a loose. A swing takes five of DFO's strike frames,
and its blow lands as the third begins: a frame lasts 0.149 s for a sword, three quarters of DFO's swing law at an
average Speed ([[Combat]]). A dagger and bare hands come round quicker; a mace, a flail and the two-handed weapons
slower. In a fight the rules' own swing paces each strike, whatever the weapon: its blow's frame shows on the tick they
land it and it ends with their swing, and a pair's flurry, drawn from the hand already raised, lands when they land it.
The strike's own frames run faster than that
([[First Person Strikes Faster Without Arcs, and Arcs Follow the Drawn Blow]]): the first is held until a quarter of the
way to the blow, the first two run through the last three quarters of that time, the third shows as the blow lands, and
the last two run over a little over half that time after. The weapon is then at rest while the swing runs out. Bare
hands' strike to the left goes up and back down over eight frames, paced the same way.

A bow has two shots ([[Ranged Weapons Aim and Fire]]). Not aimed, a pull of the trigger looses a quick shot at once:
the bow jumps to its sixth frame, the arrow leaving on it, and plays the rest of its release, a frame every 0.0625 s;
holding the trigger looses again as it reloads. Aimed, it draws and stays drawn at its fourth frame until a pull
looses it the same way; letting the aim go lowers it unloosed. The bow then reloads for about a quarter of a second.

### Guarding

While the guard is held, a weapon stands upright across the middle of the view, its left stroke's third frame held; a
parry's deflect plays its right stroke's second to fourth frames over the deflect. A shield is raised whole for both.

### A blow that meets something

A blow of the player's own that lands lights the weapon's picture with a white rim for one frame, bursts its element
off it ([[Weapon Glow]]) and jolts the hands 2 design pixels down for 3 frames; a blow of theirs blocked or parried,
or one they block, jolts them 4. Never a trail
([[First Person Strikes Faster Without Arcs, and Arcs Follow the Drawn Blow]]).

### A pair

A pair takes turns at blows, by DFO's law. The right hand opens. A blow begun while the last is under way, or within
0.75 s of its end, is the other hand's, thrown from a raised hand: it starts a frame into its swing, so it lands a
frame sooner. Holding the button, the hands alternate. Past the 0.75 s the right opens again.

The left hand is the right hand in the mirror. Its sweep to the left is the right hand's sweep to the right, drawn
mirrored, so each blow goes the way it was asked. Bare fists draw the arm Daggerfall painted on the striking hand's
side: its rest and three strikes paint the right arm, the other three the left. While one hand strikes, the other
lowers by 0.12 of its own height, or a fist tucks 10 pixels in and 9 down, eased in over 0.05 s and out over 0.14 s.
Fists at rest bounce gently down, out of step. The hand that struck last is drawn over the other.

A gun or a crossbow beside a blade takes turns with it too, and reloads twice as long, one-handed. A pull the law gives
it while it reloads is the blade's.

### Shooting

The guns and the crossbow fire on a trigger. A click fires when loaded; holding fires again as it loads, but not while
aiming, where each shot takes a fresh pull as the rules ask. In a fight, any weapon, a bow too, plays a shot only as
the fight's rules let one go, so a pull they refuse (no ammunition, a reload, a swap of loadouts) plays nothing; a gun
with no shot left clicks dry ([[Combat]], "Shots"). Its reload ends when the rules' does, which a quicker reload or
a kill that reloads ([[Gear]], "Perks") makes sooner than the weapon's own clock, so the next shot they let go plays;
a brace's two guns load once both have fired. A weapon changed while the rules are busy (a swing, a guard, a reload, a
draw) stays in hand until they take the new one up at rest, as the swap begins. Aiming zooms the weapon with the view,
about the middle of the screen, and its muzzle with it, so a tracer starts where it is drawn
([[First-Person Aiming Zooms the Weapon With the View]]). A shot plays its frames at its own rate, then the weapon
reloads:

| | Frames | A second | Leaves on | Reload | Kick | Dips |
|---|---|---|---|---|---|---|
| Dwarven Thunderlock | 7 | 14 | 2nd | 1.7 s | 5 px | 0.55 |
| Dwarven Pistolet | 6 | 12 | 2nd | 1.4 s | 3 px | 0.7 |
| Crossbow | 7 | 7 | 2nd | 0.6 s | 1.5 px | none |

The kick is a spring: the barrel is up at once and rides back down, and a second shot stacks on what is left. While a
gun reloads it dips by its share of its own height, in over the reload's first fifth and back up over its last
quarter. A crossbow's own frames lower it to span the prod and raise it loaded. The swing reported runs through the
shot's frames, then through its reload, marked as the reload.

In a volley, a click fires the hand the pair's law names, or the loaded one if that hand is still reloading, so the
second pistol can fire while the first still smokes. Held, the volley fires again as each shot's frames end.

Running on the ground with every gun loaded, the guns are carried: the Thunderlock low across the chest, a Pistolet
held up, a frame each sixth of a stride. The carry comes up over a fifth of a second and dips 70 pixels as its hold
changes, so no picture swaps in sight.

Each ranged weapon's muzzle is known on its own picture, at rest and in the frame its shot leaves on, kicked up (design
pixels): the Pistolet's at (72, 64) and (82, 53), the Thunderlock's at (66, 59) and (77, 42), the crossbow's at (109,
93) and (82, 73), and a drawn bow's arrowhead at (107, 150). The first person reports the firing one where the hands
stand that frame, before they are drawn, so a shot let go then starts its tracer where it will be drawn.

### Which picture

Each frame shows one picture, named by the weapon's file, its record and its frame. A metal's own picture is used where
the forge drew one, else the picture every metal shares. A dagger or a sword is laid from two layers, the hand in the
gauntlets worn and the blade in its own make, the nearer shown at each texel. A bow is laid under the hands that hold
it. Fists wear the gauntlets for a punch and the boots for a kick.

A gun is its own layer, plain or gilded, under the hands in the gauntlets worn. A crossbow is a cell of its metal's
strip: iron, steel, silver, elven, dwarven or mithril, each its own model and colours, undyed; any other metal draws
steel's. One of a pair draws from its metal's pair strip, smaller and farther across. A shield is its metal's make,
or the plain wooden shield, under the hand on its grip. The torch and the lantern are their own layers under a hand. The healing
flask is its own layer, its draught's red undyed, under the right hand round its neck.

The forge draws every metal grey. A grey texel goes to the nearest step of Daggerfall's metal band and takes that
step of the metal's ramp; every other colour snaps to the nearest palette colour. Steel, leather, chain and the guilds'
sets keep their own colours, unless a dye or a faction's colour is worn: then the gauntlets and boots are covered whole
by its light, as the figure's armour is, and a faction's bow, staff and shield in its colour, each laid by its set's
span of light on the player's body ([[Gear]], "Cosmetics"). A faction's blade keeps its metal and wears its colour on
the hilt, guard and trim the forge marks, laid across the trim's span of light in the blade's first frame in hand
(`trimOf`). Bare hands take iron's.

A dagger's or a sword's blade layers, right hand and left, reach the game from a `forge` run asked for by hand with
`firstperson` ([[Sprite Forge]], "Running it"); until a metal's are published, its blade draws as it did.

### On the screen

Each picture lies on a 320 by 200 design screen, scaled to the canvas, texel for texel, with its clear texels cut out,
over the scene. A weapon lies at its own place, but a sword rests 60 pixels below its own and 40 to the right, its blade
clear of the crosshair (in the left hand, 40 to the left); its strikes keep their own places, since lowered as far they
leave the screen ([[First-Person Placement Is Our Own]]). A gun sits flush in the bottom right corner, sunk its kick's
height below the foot. A crossbow's rest frame sits flush in that corner, and every frame where that puts it. The left
hand of a pair is mirrored about the middle, and each weapon of a pair stands 34 pixels further out toward its own side,
at rest and through every blow, so the two blades do not close on the middle.

The left hand's things are placed as our own ([[First-Person Placement Is Our Own]]): in the lower left, the mirror of
the weapon side, a texel a pixel. A shield's and the lantern's arms leave through their left edge, so they sit flush to
it, their feet on the screen's. The torch stands 4 pixels in, its arm leaving through its foot across from where a
dagger's does. A shield is held a frame below raised, and raised whole for a block when the state asks for one. While
the weapon strikes, a shield or a torch ducks below the screen, as fast as a climb lowers a weapon, and comes back up
once the strike ends. A lantern stays up. A light's flame steps every 0.1 s.

While the player drinks, the weapon is put away and the healing flask shows in the right hand, flush in the bottom
right corner, a frame for each quarter of the drink: brought up from below the screen's right foot, raised before the
face, tipped up at the lips with its glow filling the middle of the view, and lowered away. The weapon comes back as
the drink ends. Where the flask's frames are not published, nothing shows in the weapon's place while it lasts.

While walking, the picture dips a few design pixels each step, more at a run. The weapon sways as it is held (`Sway`):
it lags behind the look as it turns or tilts, 4 design pixels a radian a second and at most 12, catching up over about
a tenth of a second as the look settles, and swings aside once each two steps, 2 pixels at a walk and 4 at a run. It
eases out on a wall, where the hands keep their stone, and on a horse, whose reins stay still. A picture cut at an edge
of the screen (a gun's stock at the right, a shield's or a light's arm at the left, any arm at the foot) never sways
farther off that edge than it reaches past it, so no gap opens there (`swayedQuad`). A ranged weapon's muzzle is placed
with its sway, so a tracer starts where it is drawn. A flail at rest wears its chain's swing,
a pendulum the walk sways. Running with empty hands or a sheathed weapon pumps both arms, the left half a stride behind
the right. A gun, or one crossbow, is carried across the chest at a run, from the forge's own carry frames in the
gauntlets worn; a pair of crossbows keeps its own frames. A cast shows both casting hands for 0.28 s and hides the
weapon meanwhile. In an armour set's gauntlets each casting hand is the set's whole arm, dyed as its fists are, under
the element's light; with none it is the linen sleeve and the leather glove. An Art's cast is lit by its light,
Divine's fire, Storm's shock and Shadow's magic, recoloured by brightness to its element's glow ([[Arts]]). A new look's
pictures are composed ahead and kept on the GPU, and so are the other loadout's weapon's, so a swap shows it at once;
the figure's are composed ahead in the glow the other weapon will show once drawn.

Another player or a foe is never drawn nearer the eye than 1.5 m in first person, on land, on a struck ship's deck,
on the wreck and on the [[Test Ground]] alike (`cardStand`): a foe in a melee stands that far off along the same line,
so it never fills the view, and its parry ring stands round its head as drawn
([[First Person Widens and Its Weapon Sways, and the Parry Ring Reads Bolder]]). In third person
no figure is moved off the eye, so the player's own stays where they stand when the camera pulls in by a wall.

### Climbing

A climb lowers what is held out of the bottom of the screen and brings both hands up onto the wall from under it, the
painting of a left hand as drawn and the right its mirror, each 93 pixels from the middle, the sleeve 34 pixels under
the screen's foot. Each hand opens as it comes and closes on the stone as it arrives. In an armour set's gauntlets the
arm is the set's, dyed as its fists are; with none it is the linen sleeve and the leather glove, laid as drawn, undyed.

The hands move as the climbing body does, as DFO's climbing hands do
([[First-Person Hands Climb, Shimmy and Reach When Looking Away]]):

- **Hanging still**, they sway a little with the body.
- **Shimmying**, the hand the body goes toward lets go, lifts, opens and reaches first, and the other closes up after
  it: a grip every quarter metre along the lip. A hand holding the lip keeps its stone as the body passes it.
- **Climbing**, they go hand over hand, a grip every 0.45 m: one holds while the other reaches, and a hand holding its
  stone goes down the view as the body climbs past it.
- **Going over a top**, they go down the view as the body rises past them, press open on the top and let go as it
  stands. A vault plants them on the top and lets go as the body passes over.
- **Looking away from the wall**, from 40 degrees off its face and wholly by 75, the hand on that side lets go and
  becomes the reaching arm: up from that side's edge, open toward the middle, feeling for a hold. The other holds on.
  Looked back, it comes back onto the stone.

The fists stay on the wall, not the screen: turning or tilting the view carries them across it with the stone, and
up the view no further than the sleeve's slack. Only the reaching arm stays on the screen. Looked 50 degrees or more
down, the hands go out of the view, wholly by 80.

### Riding

On a horse the first person shows the Courser's head and neck from the saddle, its texels 0.8 as wide as tall, centred
on the screen's foot. Each gait steps its frames on the rider's own figure's clock: a walk's 0.125 s, a gallop's
0.0625 s. A gallop's frames sink half the rows their ears rise above its lowest. Turning the look faster than 0.7
radians a second turns the head into the turn, held 0.25 s past it. Standing still, the horse flicks an ear every 3
to 9 s. The head takes the coat worn on its hide, and the barding worn is its own strip over it ([[Gear]],
"Cosmetics").

Each free hand holds its rein, its fist over it in the gauntlets worn, the left drawn as the right turned back about
the middle. The hands give on the stride's beat, the left a beat behind; in a turn the inside hand draws in and the
other gives. A drawn weapon takes the right hand, and a weapon, a shield or a light the left; an empty hand holds its
rein, not its fist up.

As a drink's heal comes, the first person shows no light on the body: a faint red light comes in at the screen's edge
and motes drift up its sides, drawn with the fight's display ([[Combat]], "Healing charges").

## Limits

- No weapon shows wear, and no gun's flash lights the room.
- The swing's pace takes no account of the player's Speed and Strength or the weapon's weight, nor a pair's off hand
  feeling its weapon heavier. A Greatsword's swings are the sword's pictures in first person, at its own pace.
- The Wraith Mist barding draws nothing from the saddle, and about a tenth of the hide keeps the bay's colour under a
  coat ([[Gear]], "Limits"). There is no cart, bench wagon, petting or feeding.
- A cast always shows both casting hands; no spell is held ready in a free hand beside a weapon.
- The tools, the instruments and the held map are not drawn.
