---
type: system
status: live
code:
  - client/src/elementGlow.ts#glowField
  - client/src/elementGlow.ts#GLOW_WGSL
  - client/src/elementGlow.ts#GLOW_BURSTS
  - client/src/player/glowCards.ts#GlowCards
  - client/src/player/cards.ts#Cards
  - client/src/player/gear.ts#heldElement
  - client/src/firstperson/firstPerson.ts#glowOf
  - client/src/combat/sparks.ts#trail
  - client/src/combat/tracers.ts#ribbonsOf
---
# Weapon Glow

The player's own weapon glows in its element while it is drawn: Blaze, Volt or Cosmic, the [[Gear]]'s element on the
weapon in that hand ([[Your Weapon Glows in Its Element]], [[Pick - Weapon Glow]]). It glows in [[First Person]] and on
the player's own figure; the player's shots and landed blows take the element too. Other players' figures, foes and
the menu's pictures stay plain.

## How it works

- **The outline.** A glowing picture carries a field, worked out once when the picture is made: each pixel's distance
  to the weapon's nearest pixel, whether the weapon lies straight below it, and whether it is inside the weapon, on its
  edge or off it. The field reaches 5 of the picture's pixels round the weapon, so an outline is never cut square. Its
  shader draws a band round the weapon in four hard steps of the element's colours, white-hot by the weapon and
  darkest at the band's reach, on the picture's own pixels, and lights the weapon's own edge.
- **Blaze** climbs in tongues. Its band reaches 1.8 times as far up as across and 0.6 times as far down, its reach two
  noises scrolled upward, at most 2.7 pixels across; embers rise off the weapon at six pixels a second. Its colours run
  `#4a1606`, `#ff7a2a`, `#ffd36a`, `#fff4d6`.
- **Volt** crackles. Its band is measured along the pixels' grid, three pixels out, with arcs of up to two more struck
  again 12 times a second, a surge of one more in about a fifth of each third of a second, and 18% of its 2 by 2
  blocks dropped at each strike. Its light on the weapon's edge flickers at 12 Hz. Its colours run `#0b2a44`,
  `#46beff`, `#9fe3ff`, `#f2fcff`.
- **Cosmic** breathes. A halo of about two pixels swells every 4 s, its band turned by a swirl that goes round once in
  8 s, and stars light in a cross for 0.4 s, about 3% of its pixels a second. Its colours run `#26093f`, `#9c55ff`,
  `#d7b3ff`, `#fbf3ff`.
- **The clock.** The glow's clock wraps every 240 s, and every rate is whole over it, so the wrap never jumps.
- **On the figure.** The forge's compositor marks the weapon's pixels. A glowing figure's frame is composed apart from
  a plain one, its field made with it and let go with it. Its outline is drawn after the figures, blended over them
  and tested against their depth, in the [[Test Ground]] and the [[Game]].
- **In first person.** A sword or a dagger laid over its hand glows on its blade only; every other weapon's picture
  glows whole. Each hand glows in its own weapon's element, each outline drawn just after its picture. A picture
  standing on the screen's foot takes no light along it.
- **Shots and blows.** The player's own tracers take the element's colours at the plain tracers' opacities, a Volt one
  jumping up to 0.04 m twelve times a second, and leave about 30 motes a second. A blow the player lands for harm
  bursts in the element where it lands: Blaze 12 embers that float, Volt 10 quick sparks, Cosmic 14 motes that hang.
- **The Test Ground.** Its Attack feel's Element glow row turns the glow off, or shows the gear's own element or one
  chosen in its place.

## Limits

- The figure takes one element, its main hand's: every weapon pixel on it glows in that.
- A first-person picture at the screen's side keeps its light along that side.
