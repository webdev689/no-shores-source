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

## What it settles

- **Each enemy faction has its own voice**, the Grey Tithe's and the Lattice's, at four moments: as a foe spots the
  player, as its blow swings, as it is struck, and as it falls ([[Interface]], World sounds).
- **The horse's sounds are drafted anew** for walking, galloping and its other sounds, judged on the sound sheet as
  every sound is ([[Sounds Come From Freesound, Judged on a Test Sheet]]).

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| A foe's voice | Its faction's, by the faction number the foe carries (1 the Grey Tithe, 3 the Lattice) | Every foe is one or the other; the crew fight on the players' side |
| The cues | `foe.tithe.*` and `foe.lattice.*`, each `alert`, `attack`, `hurt`, `death` | One a moment a faction |
| The searches | The Tithe as men: a rough shout, an attack grunt, a pained grunt, a dying cry; the Lattice as crystal: a glass screech, crystal cracking, glass chipping, glass shattering | The Tithe are raiders; the Lattice are people overtaken by the crystal |
| Attack effort | Heard with the swing's own whoosh, as the blow sweeps | The moment the effort is made |
| A killing blow | Heard as the foe's death alone, not its hurt as well | One cry, the last |
| Until picked | Silent, as every cue is; but the alert stays the shared one every foe had until the faction's own is picked | No foe falls silent on spotting the player |
| The horse's strides | Searched as recordings of 1 to 30 s, one stride to be cut from the pick | Freesound holds almost no single strides: twelve of the horse's fourteen cues had never found one |
