---
type: system
status: planned
code:
  - client/src/cinema/ambience.ts#Ambience
  - client/src/cinema/ambienceShapes.ts#thunderShape
  - client/src/cinema/ambienceVoices.ts#crashVoice
---
# Cinema

What the [[Prologue]]'s cutscenes are made with: the camera on rails, the screen's fades and bars, the weather
(clouds, rain, snow, mist, a storm and its lightning), birds, fire and smoke, and the sounds of the sea and the storm.

## How it works

Being built.

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
