---
type: system
status: planned
code:
  - client/src/cinema/rail.ts#railShot
  - client/src/cinema/cues.ts#Cues
  - client/src/cinema/cues.ts#HoldToSkip
  - client/src/cinema/screen.ts#Screen
  - client/src/cinema/lightning.ts#Lightning
  - client/src/cinema/ambience.ts#Ambience
  - client/src/cinema/ambienceShapes.ts#thunderShape
  - client/src/cinema/ambienceVoices.ts#crashVoice
---
# Cinema

What the [[Prologue]]'s cutscenes are made with: the camera on rails, the screen's fades and bars, the weather
(clouds, rain, snow, mist, a storm and its lightning), birds, fire and smoke, and the sounds of the sea and the storm.

## How it works

### The camera and the screen

- **Rails** (`railShot`). A cutscene's camera runs through keys, each a time, an eye, the point it looks at and,
  where it changes, the lens. Eye and look are each carried on a Catmull-Rom curve through the keys, so the camera
  sweeps through them without a corner; it eases out of rest at its first key and into rest at its last unless the
  rail keeps moving. A rail laid in a ship's own frame is carried into the world each frame as she sails.
- **Moments** (`Cues`). What happens once at given seconds into a cutscene (a line, a sound, a flash) runs in time
  order, exactly once, however long the frames are; a skipped cutscene runs every moment left at once, so the world
  is left as its end would leave it. Holding Space for a second skips (`HoldToSkip`), its share shown at the bottom
  right.
- **The screen** (`Screen`), laid over the canvas: fades to black or white over any time, a white flash, the
  letterbox's bars, eyelids that close from above and below for waking, a blur over the whole view, the title (the
  game's name over a brass rule) and a prompt that breathes under it.
- **Lightning** (`Lightning`). Strikes come by themselves at seeded moments, 4 to 11 s apart, 0.4 to 4.5 km round the
  eye, or where a story calls one. Each is two flashes and a fading glow over a second, brighter the nearer it falls,
  its bolt shown for 0.22 s, and its thunder heard as late as its distance makes it.

### Sound

`Ambience` makes the sea's and the storm's sounds in the browser, all synthesised from noise, filters and
oscillators, none recorded. It plays through the world's output, so the world's volume governs it; nothing plays
until that output answers, and while it is gone the levels keep gliding, so the sound picks up where they stand.

- **Beds.** Seven: rain (a hiss over a roar of drops), wind (a gale whose pitch and strength wander at unrelated slow
  rates, so the gusts never repeat), waves (the sea swelling round the hull), fire (a low roar under crackle), the
  deep (a muffled pressure), gulls and creaking timbers. A scene sets each from 0 to 1 and it glides there, eased at
  both ends. The noise is made once for each audio context and folded at its ends, so a loop has no seam. A bed is
  built only once it is first heard.
- **Spot sounds.** Gull cries, timbers creaking, waves breaking on the hull, pops in the blaze and groans in the deep
  ride on their beds, at random gaps that shorten as the bed grows louder and stop when it falls silent.
- **One-shots.** Thunder arrives a second for every 0.343 km, duller and quieter the farther it is: within 0.5 km a
  tearing crack, by 2.5 km only a roll. Then the crash of two hulls (timber splitting, a deep boom, debris after), a
  splash from a plank to a body, a body hitting the deck, the ears ringing, a heartbeat, the deep's bright flash (a
  glassy swell rising an octave) and the whoosh of a fast camera move. Each lets go of its nodes once played.
- **Levels.** The storm's rain is the loudest bed and the crash the loudest sound; nothing reaches full scale.

## Limits
