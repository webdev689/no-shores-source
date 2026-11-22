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
- The whole prologue is gone over for what hides the player or their crew, what is heard when skipped, and what the
  pad cannot reach ([[Prologue]]).

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| What the wreck's camera keeps clear of | The wreck as drawn: its course lowered to the tops of the mesh's planks and rails, worked out once as the wreck is laid (`cameraCourse`) | The course's walls stand 3.2 m over any blocked square, so the camera came in to the back of the head under open sky |
| The wreck's dead ends | Ground the way between the key spots never needs, walled in on three sides, left out of the course (`withoutDeadEnds`) | Fighters were knocked into pockets off the narrow ways and could not walk out |
| The sea off the wreck's ground | Its footprints fitted to the hulls in 6 m pieces (`dryFitted`) | The ground ran out past the hulls' sides, so a fighter stood on the sea and fell in |
| Where the crew regroup | Spots with 0.45 m of ground round them every way | A spot at an edge put them half over the side |
| The wake | The run's camera takes over as the camera leaves the eyes; the figure is drawn once the camera stands a metre out | It cut back in to the head from inside the boom |
| Character creation | Opens off the helm's port side, abeam on a wide screen, 60° round on a tall one (`openingTurn`) | The wheel and binnacle hid two thirds of the figure |
| The lookout | To port of the foremast | The mast hid him in every shot astern |
| The calm's deck shot | Off to port of the spanker's boom | The boom hid the gunner's head as he spoke |
| The arena | Reached 1.6 m clear of its heap (`ARENA_CLEAR_M`) | At the heap's foot, the heap rising pressed the camera into the head |
| Thule's crew overboard | Turned most of the way toward the camera | They cheered with their backs to it |
| A skipped beat | Says and sounds nothing, its thud and splash included | A skip's sounds rang out over the next beat |
| The pad's Start | Opens the menu on the wreck, as I does | The pad could not reach the menu in the story |

Links: [[Prologue]], [[The Prologue's Camera Flights Stand Clear and Go Slower]], [[The Crew Still Standing Regroup Ahead]].
