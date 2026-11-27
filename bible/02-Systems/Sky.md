---
type: system
status: live
code:
  - crates/sky/src/clock.rs#world_seconds
  - crates/sky/src/clock.rs#day_fraction
  - crates/sky/src/heavens.rs#heavens_at
  - crates/sky/src/heavens.rs#latitude_deg
  - client/src/sky/skyLook.ts#lookOf
  - client/src/water/skyDome.ts#SKY_DOME_WGSL
  - client/src/overworld/overworldCamera.ts#cloudBaseOf
  - client/src/sky/bolts.ts#underWeatherM
  - client/src/sky/lamps.ts#lampsRound
  - client/src/nearest.ts#Nearest
  - client/src/sky/skyUniform.ts#SKY_WGSL
  - client/src/sky/skyDriver.ts#SkyDriver
---
# Sky

The world's clock and what stands in its sky: the sun, the moon and the stars over any place at any moment, the same
in every room and browser ([[Weather and Day and Night Come From DFO, Much Improved]], [[A Day Lasts One Real Hour]],
[[Weather and Day as Claude Shapes It]]).

## How it works

- **The clock.** World time is seconds from a fixed midnight, read off the wall by a room's host. A day lasts one
  real hour, so noon falls half an hour after each midnight, and every place keeps the same hour.
- **Latitude.** A place's latitude comes from how far down the map it lies: 62 degrees north at the top edge, 8 at
  the foot. The tundra, the highland and the steppe lie in the north; the desert, the savanna and the rainforest in
  the south.
- **The sun.** It rises in the east, stands south at noon (in the far south, under 15 degrees, a little north of
  overhead) and sets in the west, on the path a real sun takes at the place's latitude in a long summer (15 degrees
  north of the equator). The north's noon sun is lower and its night shorter: night, once the sun is 6 degrees under
  the horizon, lasts about 14 minutes of the hour at the map's top edge (18 over the tundra) and 27 at its foot.
- **The moon.** One moon, new to new in eight days. It trails the sun by its phase, so a full moon rises at dusk and
  stands highest at midnight, and at full it stands as far south of the equator as the sun stands north of it.
- **The stars** wheel about the pole once a day.
- **A told sky.** The [[Prologue]] tells the sky what it is (`ToldSky`) in place of the world's: the moment its sun,
  moon and stars stand at, the clock its clouds drift and its strikes fall on, its cloud, storm, rain, fog, wind and
  wetness, and its own strikes. The sky draws it as it draws the world's, with the falling weather, the bolts and the
  lamps; the music and the ambience hear it. When the story stops telling, the world's sky comes back at once, its
  lightning read afresh.

## How the sky looks

The browser reads the sky's law at the eye each frame and turns the reading into colours and lights (`skyLook.ts`);
the water's backdrop draws the sky from them, and the water reflects it.

- **By day** the sky is blue overhead, paler at the horizon. The sun is a small bright disc with a halo that widens
  as it sinks. Its light is white overhead and turns gold and then orange as it nears the horizon.
- **Twilight.** At sunset the sky is still blue. A warm glow sits low toward the sun's bearing, gold while the sun is
  up and red once it is under. Opposite the sun, a pink band lies over the earth's bluer shadow. The sky darkens
  slowly through civil twilight (the sun 6 degrees under) and is a deep blue, never black, by night. Dawn runs the
  same way back, so the sky brightens well before sunrise.
- **Night.** Stars come out as twilight ends. They wheel about the pole, which stands due north as high as the
  place's latitude. Cloud hides them, and a bright moon washes out the faint ones. The moon is a disc lit on the
  sun's side by its phase, with a faint halo. Under a full moon the moon is the key light, and with the night's
  floor of light the land and the city stay plainly readable.
- **Clouds.** Two layers drift with the weather's steering flow, the same in every browser. Each pattern is carried
  only through its own spell of ten minutes, and the next fades in over the spell's last quarter, so walking from the
  westerlies into the trades never sets the clouds racing. Thin cirrus streaks lie high up. Below them is a cumulus
  deck whose cover is the weather's: scattered puffs in fair weather, a closed grey deck when overcast. In a storm the
  deck is lower and darker. The key light lights the clouds, brighter on their side toward it, with a silver edge
  round the sun and darker undersides. At sunset they take the glow's colours, and at night the moon lights them.
- **Lightning** lights the sky and the clouds from within for the flash's moment, and the air and the land under
  them: the ground's light from above, what it throws back, and the haze. The water's reflection carries it.
- **Haze and fog.** Distant land fades into the sky's colour near the horizon. The weather's fog adds its own density
  and colour: grey in rain, tan in sand, and thickest near sea level, so a low coast fills before the hills above it.
  The fog lies between the eye and the clouds: in thick fog the sky closes in to the fog's colour, the clouds fading
  into it, and nothing behind a closed deck (stars, the moon, the sun's disc) shows through. In a sandstorm the light
  from above is the dust's, so the land under it is lit warm.
- **Seen from over the deck.** The weather's fog, rain and sand lie under the cloud deck's base (where half cover's
  would stand under thinner cover). An eye under it, on foot or at the helm, sees through them along all of its line;
  one risen to twice the base, as the [[Overworld]]'s view over an island is, only along the part of its line under
  it, the share eased between, so the island shows through the rain. From 20 km up, looking down through the heaviest
  rain under a 400 m deck, about half the land's own colour comes through, where none did. The clear air's haze and
  the fog lying low over the sea still fall along the whole line (`underWeatherM`, `under_weather`).
- **The overworld camera** stays under the cloud deck. A deck forms from half cover, about 1150 m up, and lowers as
  the cover closes. Steady rain brings it down to about 400 m, the heaviest to about 200 m and a storm a little lower
  still; the camera keeps 60 m under it, and never comes lower than its floor.

## Lights at night

Night is in between: the open reads under the moon, while under trees and in alleys it is dark, and the lights are
what show the ground there.

- **Lamps.** The land's lights are its lamps ([[Cities]], [[Islands]], [[Passages]], [[Modules]]): a lantern's warm
  light at its glass, reaching some ten metres, a great one's up to sixty; a fire's as the fire casts it; a crystal's
  and a sunstone's red or warm light. Each view of the land (a city, its layouts, the islands, a passage's hollow)
  lights its own lamps and fires (`CITY_LAMPS`) as it is shown and lets them go as it is cleared. They are lit only as
  the daylight fades, coming up through the dusk. The glowing surfaces themselves burn brighter at night than by day.
- **One flicker, one breath.** Every light in the game moves by the same two (`client/src/sky/flicker.ts`, each with
  its WGSL twin), seeded by its source: a flame's flicker, held through each of the fire's ten frames a second, never
  below 80% at full depth; and a glow's slow breath, about seven seconds a swell, for crystal, fungus, runes and a
  portal. A flame drawn and the light it casts share its seed, so they move together ([[Lights as Claude Builds Them]]).
  On land a lamp carries how it moves (a fire's flicker, a lantern's shallower one, a stone's breath, or none for
  a steady one (a sea fight's, whose brightness already moves), and its seed) to
  the sky's uniform, and a glowing surface near it (a lantern's glass, a brazier's coals, a crystal's core, an island's
  ember, a prop's flame) moves with the nearest lamp within a third of its reach (`sky_lamp_motion`, `light_motion`);
  one with no lamp near moves by where it stands.
- **Fires.** The game's scene burns the land's fires (`GameScene.fires`, the prologue's fire of [[Cinema]], "Flames"),
  lit again only as a view's fires really change (`CityLamps.set` compares them by `fireKey`), and then only the new
  are lit and the gone put out (`relightFires`): a fire on coals casts its light as a lamp reaching eight times its
  height (at least four metres), seeded as its flames are; the Beacon's fires are lit by its own lamp, seeded alike.
  A flame is hidden by whatever stands nearer, and its smoke leans with the wind. A lantern is an enclosed light and
  burns no fire: its glass glows and flickers with its lamp (`lanternLamp`, [[An Enclosed Light Hides Its Flame]]).
- **Lamps at sea.** Each ship's lanterns are lamps where they burn, moved with it each frame, reaching thirteen metres
  as a carried lantern does, and a sea fight's flashes, blasts and fires are lamps for as long as each lasts
  ([[Sailing]], "Its lanterns"; [[Naval Combat]]); they join the city's lamps through `CITY_LAMPS`, told anew only
  when one comes or goes. The sea's surface takes their light too: a little scattered up from open water and more
  from its foam, and each lamp's glitter on the waves toward the eye, fading more slowly than its light
  ([[Every Light Is Redesigned and Animated, and Each Casts Light]]).
- **A carried light.** A torch or a lantern in the player's left hand lights round them at night, on foot and walking
  the Sloop's deck, a lamp at their hand, in first person and third alike: a torch's reaches some eleven metres and
  flickers, a lantern's thirteen and is steadier.
- **The nearest sixteen.** Each frame the carried light and the lamps nearest the eye (counting their reach) go to the
  sky's uniform, at most sixteen, so the cost stays bounded. Every lamp is weighed once against the seventeen nearest
  kept so far (`Nearest`), the city's lamps never all sorted, and nothing is made for them but the sixteen handed on:
  1,500 lamps take about 0.1 ms a frame (tested offline, in Node). The last of them fade as the next lamp nears, so none
  switches on or off as the eye moves. Every lit surface (the land, the plants, the city, the ships, the marks, the
  figures and the sea) adds their light: each falls smoothly to nothing at its reach, brightest on a face turned to it, with no
  shadows. A figure by a lantern is lit warm.
- **Clouds' shadows.** Under a broken sky the key light is dappled on the ground in soft patches as wide as the cover,
  drifting as the clouds overhead do. A clear sky has none, and under a whole deck they fade out: the key light is
  dimmed already.
- **Wet and snow.** The weather's wetness darkens the land and the city's stone and gives them a sheen toward a
  grazing eye; once the ground is soaked, rain stands in puddles in the deepest few of the flat hollows of the land
  and the plaza (`PUDDLE_DEEP`), their shores ragged by a finer noise and sharp, mirroring the sky, and while rain
  falls rings spread on them where drops land: one a cell of 0.5 m in more cells the harder it falls (falling snow's
  share makes none), each kept within its cell and starting again about every 1.1 s on its own beat (`sky_ripple`,
  on the world's clock and the eye's wrapped place), fading out before a pixel is wider than a ring: on the land by
  the pixel's footprint, on the city's stone from 4 to 12 m off ([[The Harbourmaster Stands in the Market, Rain Spares the Trees, and Patrol Nodes Always Stand]]). Snow
  that has fallen in the last twenty minutes whitens the flat ground and the city's flat stone where the weather laid
  it: on the ground under the eye, where it is read, and higher, fading out 100 to 300 m lower down, which is warmer.
  Puddles lie only where no snow does. Rain darkens a plant's bark and leaves, and the meadow's tufts, and lays no
  sheen on them, nor on the far woods the land is painted with ([[Nature]], "Woods from afar";
  [[The Meadow Art Is the Owner's, Its Tables Stay in Git, and the Grass Takes the Trees' Rain]]).

## Limits

- There are no seasons: the year stands in its summer.
- The World Editor and the Test Ground keep a clear afternoon sky; the World Editor's ships still sail, and their
  sails fill, in the weather's wind.
- Lamps cast no shadows, and windows are never lit: the city's plan gives windows no places.
- Standing at the Sloop's helm, the player's torch or lantern lights nothing; only walking its deck does it.
- The ground's hollows where puddles stand are a pattern, not the land's real low spots.
