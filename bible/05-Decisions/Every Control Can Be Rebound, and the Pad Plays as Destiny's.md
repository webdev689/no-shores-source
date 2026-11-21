---
type: decision
date: 2026-11-21
status: in force
---
# Every Control Can Be Rebound, and the Pad Plays as Destiny's

The owner asked, while the key strip and the sheet of every control were being reworked:

> "While we're working on controls. Lets go ahead and set up proper keybind switching and implement controller support"

Asked which pad layout to start from, every button rebindable either way, and where changed binds are kept, the
owner chose from Claude's options:

| Asked | The owner's pick | The option as offered |
|---|---|---|
| The pad's layout | "#1 but b to dodge/b hold to crouch" | "Destiny 1's layout (Recommended)": "Left stick move (click to run), right stick look; RT swing or fire, LT guard or aim; A jump, B crouch (hold: dodge), X use (E), Y draw/switch weapon; LB/RB the Tenets, both together the Anima; D-pad loadouts and heal; Start the menu, View the controls sheet. At sea: left stick steers and sails, triggers aim and fire. Menus: D-pad or stick moves, A presses, B backs out, LB/RB turn tabs." |
| Where changed binds are kept | "With the account" | "Saved with the signed-in account, so they follow the player to any browser. Needs the accounts server to keep them" |

Of the controls' words the owner had said before: "The text is too over explanatory".

## What it settles

- Every control the sheet lists is bound in one table, on the keys and on the pad, and the player can bind each anew
  from the sheet ([[Interface]], "Binding a control").
- The pad plays as the layout offered, but B tapped dodges and B held crouches ([[Interface]], "The pad").
- What the player binds is kept with their account, so it follows them to any browser ([[Accounts]], "Binds"); every
  player is an account from the first visit, so every player's binds are kept.
- The words on the strip, the sheet and its prompts stay a few each.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| A key another control uses | Where the two act alike (on foot, dead, in a window, at the helm, in a sea fight), the two swap keys and the sheet says "Swapped with" it; where the other would be left with nothing, the binding is refused and the sheet says it "needs it" | No control is left unbound by accident |
| Cancelling a binding | Escape, or six seconds with nothing pressed | A pad has no Escape, and every pad button can be bound |
| What is bound | Every key and pad button; a mouse's gesture (the click to look or to sail there, a drag, the wheel), Tab, Escape, the arrows on the menu's tabs, the sticks and the pad's buttons in a window are fixed | "Every button rebindable"; the sticks are not buttons, and a window's own keys are its way out |
| A button held, two together | A pad key binds as a tap, a hold past 0.3 s (`B hold`) or two pressed together (`LB+RB`) | The owner's B hold and LB with RB need both |
| The pad's other buttons | The cross's up mounts; the right stick's click changes the view; Start opens the menu at Character, whose tabs LB and RB turn; View held opens the game's menu (Resume, Return to ship); dead, A respawns. At the helm: A sets sail, lands or docks, X stops or resumes, the cross slows, speeds, opens the map and repairs, Y manages the ship, B leaves the helm and steps back from the map. In a sea fight: the left stick's click bursts, LT held aims and let go unfired holds fire, the cross changes the shot, B braces, X boards, the right stick turns the view | What the layout offered left open; Start for the tabbed menu, as Destiny's; the game's own menu still reached |
| The analog stick | It walks, steers and looks as far as it leans, past a 0.2 dead zone; its click runs until the stick comes to rest | "Click to run", as Destiny's sprint |
| Which keys show | The strip and the sheet show the pad's while the pad was played last, the keys' and the mouse's while they were; the sheet shows both sides, the one in use bright; the strip shows each control's first key, the sheet every key | "Only what applies right now" |
| Keeping the binds | Only what differs from the defaults, sent a moment and a half after the last change, read once the account is known and again when another signs in; offline, the game plays on with what it has | Few saves, and the defaults can change later |
| The page's pads in the game's thread | The page reads the pads each frame and sends them to the game's worker | A worker has no Gamepad API |

Links: [[Interface]], [[Accounts]], [[The Key Strip Follows the Moment, and K Opens Every Control]].
