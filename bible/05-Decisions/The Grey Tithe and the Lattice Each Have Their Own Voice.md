---
type: decision
date: 2026-11-25
status: in force
---
# The Grey Tithe and the Lattice Each Have Their Own Voice

> "I also want to draft new horse sounds for walking. sprinting, and varied horse sounds.
>
> We also need to draft sounds for enemies grey tithe and lattice"

Asked which moments should get sounds of their own, drafted separately for each faction, the owner chose all four:
"Alert", "Attack effort", "Hurt" and "Death".

On the sheet the owner wrote "All of these" under the Grey Tithe's attack grunts and its pain grunts, "All" under its
alerts, and "No glass" under the Lattice's swing, hurt and death. Then: "Additionally, I want to avoid sound spam from
enemies".

Freesound held no horse in water, nor boosting on stone, in any wording. Asked whether those hoofbeats should play the
ground's until a recording turns up or stay silent: "yes play a sound in their place".

## What it settles

- **Each enemy faction has its own voice**, the Grey Tithe's and the Lattice's, at four moments: as a foe spots the
  player, as its blow swings, as it is struck, and as it falls ([[Interface]], World sounds).
- **The horse's sounds are drafted anew** for walking, galloping and its other sounds, judged on the sound sheet as
  every sound is ([[Sounds Come From Freesound, Judged on a Test Sheet]]).
- **A cue may be several recordings**, its variations: the Grey Tithe's alerts, attack grunts and pain grunts are all
  those the owner heard.
- **The Lattice makes no glass sound.**
- **Foes' voices never become sound spam.**
- **A hoofbeat with no recording of its own is never silent**: on stone or in water, a sound plays in its place until
  it has its own.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| A foe's voice | Its faction's, by the faction number the foe carries (1 the Grey Tithe, 3 the Lattice) | Every foe is one or the other; the crew fight on the players' side |
| The cues | `foe.tithe.*` and `foe.lattice.*`, each `alert`, `attack`, `hurt`, `death` | One a moment a faction |
| The searches | The Tithe as men: a rough shout, an attack grunt, a pained grunt, a dying cry; the Lattice first as crystal, then, on "No glass", as a creature | The Tithe are raiders; the Lattice are people overtaken by the crystal |
| Attack effort | Heard with the swing's own whoosh, as the blow sweeps | The moment the effort is made |
| A killing blow | Heard as the foe's death alone, not its hurt as well | One cry, the last |
| Until picked | Silent, as every cue is; but the alert stays the shared one every foe had until the faction's own is picked | No foe falls silent on spotting the player |
| The horse's strides | Searched as recordings of 1 to 30 s, one stride to be cut from the pick | Freesound holds almost no single strides: twelve of the horse's fourteen cues had never found one |
| Where a stride is cut | In the quiet at least 50 ms (the cut's fade) before a stride's first sound, as long as from that sound to the next stride's, found by the recording's hits (each cue's `cut` in `content/audio/freesound.json`), made mono | Strides heard back to back keep the recording's own pace, and the fade never dulls a hoof's strike |
| How often a stride is heard | Each as the last one's recording ends, while the horse moves (`HorseSounds`) | A horse keeps its stride's pace at a gait and goes faster by a longer stride; at the Bay's 6 and 12 m/s, a stride a fixed 1.7 or 3.4 m began every 0.28 s over the last one, the hoofbeats twice the recording's pace |
| The sound in their place | The same gait's hoofbeat on the ground, until the cue's own is picked (`hoofCue`) | The nearest the horse already makes; a faction's alert waits for its own the same way |
| "All of these" | The cue's `picked` a list; its files played as variations, never the same twice running, as the steps are; each one credited in Settings | The bank already plays a cue of several files |
| The Lattice, "No glass" | Searched as a creature: an inhuman snarl, cry of pain and death cry | Its alert the owner picked is no glass either |
| Against sound spam | At most two foe voices begin within 0.75 s besides a death, which is never kept back; an alert first, then a hurt, a swing; one foe's swing or hurt heard at most once in 2 s; only a fighter's voice that began counts, so one unrecorded or too far to hear keeps none back, and a raid's or a Breach's alarm, no foe's, is never held; every blow's own sound still heard | A fight of six foes struck at once is two cries, not six, and a kill is always heard |
