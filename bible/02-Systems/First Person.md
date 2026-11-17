---
type: system
status: live
code:
  - client/src/firstperson/firstPerson.ts#FirstPerson
  - client/src/firstperson/hands.ts#Hands
  - client/src/firstperson/handsLaw.ts#handsPlan
  - client/src/firstperson/weaponMachine.ts#WeaponMachine
  - client/src/firstperson/shotMachine.ts#ShotMachine
  - client/src/firstperson/fpFrames.ts#weaponPicture
  - client/src/firstperson/heldPictures.ts#gunPicture
  - client/src/firstperson/riding.ts#RideMotion
  - client/src/firstperson/climbing.ts#gripPlace
---
# First Person

What the player holds in first person, from the [[Sprite Forge]]'s first-person pictures, as DFO plays it ([[The
Player Plays as in DFO]]). The [[Test Ground]] hands `FirstPerson` the attack button and the player's state each frame:
what is in each hand, the gauntlets and boots worn, whether the hands are drawn, walking or running, the metres walked,
a cast, a climb, a ride and the look's bearing. It answers the blow that lands or the shot that leaves, and from which
hand, and reports the swing or shot under way, so the figure seen from outside plays a matching move.

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

The two-handers are the staff, the warhammer, the battleaxe, the bows and the Thunderlock.

### Swinging

A click swings once. Holding the button swings again as each blow ends. Each blow takes one of six directions at
random: down, down and left, left, right, down and right, or up. In the [[Test Ground]] the [[Combat]] rules decide
when a swing begins and the direction is chosen before it, so the first person swings as the rules do; a swing the
rules refuse (no stamina, a stagger) is not drawn. A swing the rules begin once the last blow has landed starts the
strike again, a pair's from the other hand, so no held swing is lost to the frames' rounding; one the rules end early
(a dodge, a flinch, a guard) ends in the first person at once, and a bow's draw let go too soon to shoot is put away
without a loose. A strike is five frames, and the blow lands as the
third begins. A frame lasts 0.199 s for a sword, DFO's swing law at an average Speed. A dagger and bare hands come
round quicker; a mace, a flail and the two-handed weapons slower. Bare hands' strike to the left goes up and back down
over eight frames.

A bow has two shots ([[Ranged Weapons Aim and Fire]]). Not aimed, a pull of the trigger looses a quick shot at once:
the bow jumps to its sixth frame, the arrow leaving on it, and plays the rest of its release, a frame every 0.0625 s;
holding the trigger looses again as it reloads. Aimed, it draws and stays drawn at its fourth frame until a pull
looses it the same way; letting the aim go lowers it unloosed. The bow then reloads for about half a second.

### Guarding

While the guard is held, a weapon stands upright across the middle of the view, its left stroke's third frame held; a
parry's deflect plays its right stroke's second to fourth frames over the deflect. A shield is raised whole for both.

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

The guns and the crossbow fire on a trigger. A click fires when loaded; holding fires again as it loads, but not
while aiming, where each shot takes a fresh pull as the rules ask. Aiming raises one held alone down its side: it slides from its corner, as far as the aim has eased, until its muzzle at rest
lies at (165, 107) on the design screen, just right of and below the crosshair at its middle. A shot plays its frames
at its own rate, then the weapon reloads:

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

Each ranged weapon's muzzle is known on its own picture, at rest and in the frame its shot leaves on, kicked up
(design pixels): the Pistolet's at (72, 64) and (82, 53), the Thunderlock's at (66, 59) and (77, 42), the crossbow's
at (109, 93) and (82, 73), and a drawn bow's arrowhead at (107, 150). The first person reports the firing one where the hands
stand that frame, before they are drawn, so a shot let go then starts its tracer where it will be drawn.

### Which picture

Each frame shows one picture, named by the weapon's file, its record and its frame. A metal's own picture is used where
the forge drew one, else the picture every metal shares. A dagger or a sword is laid from two layers, the hand in the
gauntlets worn and the blade in its own make, the nearer shown at each texel. A bow is laid under the hands that hold
it. Fists wear the gauntlets for a punch and the boots for a kick.

A gun is its own layer, plain or gilded, under the hands in the gauntlets worn. A crossbow is a cell of its metal's
strip: iron, steel, silver, elven, dwarven or mithril, each its own model and colours, undyed; any other metal draws
steel's. One of a pair draws from its metal's pair strip, smaller and farther across. A shield is its metal's make,
or the plain wooden shield, under the hand on its grip. The torch and the lantern are their own layers under a hand.

The forge draws every metal grey. A grey texel goes to the nearest step of Daggerfall's metal band and takes that
step of the metal's ramp; every other colour snaps to the nearest palette colour. Steel, leather, chain and the guilds'
sets keep their own colours. Bare hands take iron's.

### On the screen

Each picture lies on a 320 by 200 design screen, scaled to the canvas, texel for texel, with its clear texels cut
out, over the scene. A weapon lies at its own place, but a sword rests 60 pixels below its own and 40 to the right, its blade clear of
the crosshair (in the left hand, 40 to the left); its strikes keep
their own places, since lowered as far they leave the screen ([[First-Person Placement Is Our Own]]). A gun sits flush in the bottom right corner, sunk its kick's
height below the foot. A crossbow's rest frame sits flush in that corner, and every frame where that puts it. The left
hand of a pair is mirrored about the middle, and each weapon of a pair stands 34 pixels further out toward its own side,
at rest and through every blow, so the two blades do not close on the middle.

The left hand's things are placed as our own ([[First-Person Placement Is Our Own]]): in the lower left, the mirror of the weapon side, a texel a pixel. A
shield's and the lantern's arms leave through their left edge, so they sit flush to it, their feet on the screen's.
The torch stands 4 pixels in, its arm leaving through its foot across from where a dagger's does. A shield is held a
frame below raised, and raised whole for a block when the state asks for one. While the weapon strikes, a shield
or a torch ducks below the screen, as fast as a climb lowers a weapon, and comes back up once the strike ends. A
lantern stays up. A light's flame
steps every 0.1 s.

While walking, the picture dips a few design pixels each step, more at a run. A flail at rest wears its chain's swing,
a pendulum the walk sways. Running with empty hands or a sheathed weapon pumps both arms, the left half a stride behind
the right. A gun, or one crossbow, is carried across the chest at a run, from the forge's own carry frames in the
gauntlets worn; a pair of crossbows keeps its own frames. A cast shows both casting hands for 0.28 s and hides the
weapon meanwhile. In an armour set's gauntlets each casting hand is the set's whole arm, dyed as its fists are, under
the element's light; with none it is the linen sleeve and the leather glove. A new look's pictures are composed ahead
and kept on the GPU.

### Climbing

A climb lowers what is held out of the bottom of the screen and brings both hands up onto the wall from under it, the
painting of a left hand as drawn and the right its mirror, each 93 pixels from the middle, the sleeve 34 pixels under
the screen's foot. Each hand opens as it comes and closes on the stone as it arrives. In an armour set's gauntlets the
arm is the set's, dyed as its fists are; with none it is the linen sleeve and the leather glove, laid as drawn, undyed.

### Riding

On a horse the first person shows the Courser's head and neck from the saddle, its texels 0.8 as wide as tall, centred
on the screen's foot. Each gait steps its frames on the rider's own figure's clock: a walk's 0.125 s, a gallop's
0.0625 s. A gallop's frames sink half the rows their ears rise above its lowest. Turning the look faster than 0.7
radians a second turns the head into the turn, held 0.25 s past it. Standing still, the horse flicks an ear every 3
to 9 s.

Each free hand holds its rein, its fist over it in the gauntlets worn, the left drawn as the right turned back about
the middle. The hands give on the stride's beat, the left a beat behind; in a turn the inside hand draws in and the
other gives. A drawn weapon takes the right hand, and a weapon, a shield or a light the left; an empty hand holds its
rein, not its fist up.

## Limits

- No weapon shows wear, no gun's flash lights the room, and no enchanted weapon shimmers.
- The swing's pace takes no account of the player's Speed and Strength or the weapon's weight, nor a pair's off hand
  feeling its weapon heavier.
- The climbing hands only hold on: no shimmy, no reach while looking away from the wall, no press over a top.
- The horse is always the forge's bay. There is no cart, bench wagon, petting or feeding.
- A cast always shows both casting hands; no spell is held ready in a free hand beside a weapon.
- The tools, the instruments and the held map are not drawn.
