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

On the sheet the owner wrote "All of these" under the Grey Tithe's attack grunts and its pain grunts, and "No glass"
under the Lattice's swing, hurt and death. Then: "Additionally, I want to avoid sound spam from enemies".

## What it settles

- **Each enemy faction has its own voice**, the Grey Tithe's and the Lattice's, at four moments: as a foe spots the
  player, as its blow swings, as it is struck, and as it falls ([[Interface]], World sounds).
- **The horse's sounds are drafted anew** for walking, galloping and its other sounds, judged on the sound sheet as
  every sound is ([[Sounds Come From Freesound, Judged on a Test Sheet]]).
- **A cue may be several recordings**, its variations: the Grey Tithe's attack grunts and pain grunts are all those the
  owner heard.
- **The Lattice makes no glass sound.**
- **Foes' voices never become sound spam.**

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
| Where a stride is cut | 0.5 s from 50 ms before a stride's first beat, quiet to quiet, found by the recording's beats (the gallop's at 0.715 s, the boost's at 1.145 s), made mono | The pick's three-beat strides come about half a second apart |
| "All of these" | The cue's `picked` a list; its files played as variations, never the same twice running, as the steps are; each one credited in Settings | The bank already plays a cue of several files |
| The Lattice, "No glass" | Searched as a creature: an inhuman snarl, cry of pain and death cry | Its alert the owner picked is no glass either |
| Against sound spam | At most two foe voices begin within 0.75 s, the dying first, then an alert, a hurt, a swing; one foe's swing or hurt heard at most once in 2 s; every blow's own sound still heard | A fight of six foes struck at once is two cries, not six |
