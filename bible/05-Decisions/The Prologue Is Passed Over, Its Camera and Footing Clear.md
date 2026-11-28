---
type: decision
date: 2026-11-22
status: in force
---
# The Prologue Is Passed Over, Its Camera and Footing Clear

> "In the prolouge mission, after the ship crashes and you awake, the positioning of the camera makes it where you can
> only see the tip of your characters head. The camera needs to be adjusted where its not obstructed with geometry"

> "On I believe the 2nd or 3rd encounter of the prolouge, where enemies/allies spawn on the tiny vessel bridged between
> 2 ships, enemies/crew alike tend to fall off into the water and get stuck"

> "The entire prolouge honestly needs a detailed pass. Take some autonomy, research properly and be as detailed as
> possible, while taking your time. No questions. Only come back when everything is 100%"

## What it settles

- On the wreck the camera is never stood behind what is drawn, and the player is seen whole when they wake.
- No one on the wreck falls into the sea or is stuck there.
- The whole prologue is given a detailed pass ([[Prologue]]).

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| What the pass looks for | What hides the player or their crew, what is heard when skipped, what the pad cannot reach, and what holds a body where it cannot walk out | What the owner reported, and the same faults wherever else the story has them |
| What the wreck's camera keeps clear of | The wreck as drawn: its course lowered to the tops of the mesh's planks and rails (`cameraCourse`), worked out once at the wake the moment the mesh has come, while the player still lies on the deck | The course's walls stand 3.2 m over any blocked square, so the camera comes in to the back of the head under open sky; worked out as the camera leaves the eyes, its tenth of a second stalls the picture as the music begins |
| A wake skipped before the wreck has come | The fight holds the picture until the wreck is drawn | Played before then, its camera keeps clear of the course's walls alone, pressed to the crown of the head |
| The wreck's dead ends | Ground from which no body walks back to the path (`file.path`), a step up at most, and that a body coming from the path steps, jumps, vaults or drops into, left out of the course (`withoutDeadEnds`); a wall stays, in a dead end too | Fighters are knocked into pockets off the narrow ways and cannot walk out; no body stands on a wall, and a wall left out stops no shots |
| The sea off the wreck's ground | Its footprints fitted to the ground nearest each, in 6 m pieces (`dryFitted`) | The ground runs out past the hulls' sides, so a footprint laid to a hull leaves a fighter standing on the sea |
| Where the crew regroup | Round the checkpoint 1.8 m out, or 1.2 m, then 2.6 m, where 1.8 m has no room, each with 0.45 m of its deck round it every way (`REGROUP_M`) | A spot at an edge puts them half over the side |
| The wake | The run's camera takes over as the camera leaves the eyes; the figure is drawn once the camera stands a metre out | It cut back in to the head from inside the boom |
| The creation camera | Off the helm's port side, abeam on a wide screen, 60° round on a tall one (`openingTurn`); the turn keys turn the figure on the spot, and Done turns it back to the bow | From before the figure the wheel and binnacle hide two thirds of it, and astern the boom's crutches and the taffrail more than half, however high the eye |
| The creation camera's eye | Half a metre up for each metre out, at most 2.5 m over the deck; riding the deck's rise and fall at the helm and a quarter of its pitch and roll about it (`helmDeck`) | At a standing eye's height the bulwark hides up to half the figure as the Brig rolls, and a third of it on a near-square screen; above 2.6 m the spanker's boom swings |
| The lookout | To port of the foremast | The mast hid him in every shot astern |
| The look out over the lookout | Over whichever of his shoulders leaves the camera the more room from the foremast and the feet of its shrouds | They stand three metres behind him: one shoulder puts the eye inside the mast with the wreck a little to port, the other against the shrouds' iron with it on the starboard bow |
| The calm's deck shot | Off to port of the spanker's boom, and forward of the line from its port crutch to the player at the helm (`DECK_VIEW`) | The boom crosses the gunner's head as he speaks, and on the crutch's line the crutch stands across the player at the picture's edge |
| The ram's last shot | By the helm, a metre off the line from the boom's port crutch to the player | On that line the crutch hides up to four fifths of the player, the only figure on view, as the Frigate strikes |
| The arena | Reached 1.6 m clear of its heap (`ARENA_CLEAR_M`) | At the heap's foot, the heap rising pressed the camera into the head |
| Thule's crew overboard | Turned most of the way toward the camera | They cheered with their backs to it |
| A skipped beat | Says and sounds nothing, its thud and splash included | A skip's sounds rang out over the next beat |
| A skipped throw overboard | Black at once, as a skipped deep is | The deep fades in from black; from a fade to black begun a moment before, it cuts from the deck to under the water |
| A hand given a post with no clear way there | Leaves the post it has, walks on, and asks again from where it comes to | Standing at its old post it never moves, so a battery's hands stay at the guns of a side not run out |
| The pad's Start | Opens the menu on the wreck, as I does | The pad could not reach the menu in the story |

Replaces in part [[The Crew Still Standing Regroup Ahead]]: where 1.8 m out has no room, they stand 1.2 m out, then
2.6 m.

Links: [[Prologue]], [[The Prologue's Camera Flights Stand Clear and Go Slower]],
[[The Crew Still Standing Regroup Ahead]].
