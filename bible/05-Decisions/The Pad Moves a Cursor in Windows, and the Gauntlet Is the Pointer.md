---
type: decision
date: 2026-11-21
status: in force
---
# The Pad Moves a Cursor in Windows, and the Gauntlet Is the Pointer

The owner asked:

> "implement a navigation cursor for controller (like how DFO does it) and port over the cursor visual from DFO for
> the mouse"

Asked four questions, the owner chose from Claude's options:

| Asked | The owner's pick | The option as offered |
|---|---|---|
| "DFO's controller cursor: in a window the left stick moves a free cursor (fast, slowed and pulled onto buttons), A clicks and B goes back. #133 currently makes the stick and the d-pad step the focus from button to button. With the cursor, should the left stick drive it?" | "Stick = cursor (Recommended)" | "As DFO: the left stick moves the cursor, and the d-pad still steps from button to button, carrying the cursor onto each." |
| "DFO's own grey gauntlet (31x32, a point frame and a press frame) is the mouse cursor that can come over. DFO's classic blue arrow is Daggerfall Unity's art, so it can't. Should the gauntlet also be the controller cursor's picture?" | "Gauntlet for both (Recommended)" | "One picture: the mouse and the pad cursor both wear the gauntlet." |
| "DFO's pad cursor has extra buttons. Which should Overlook's have?" | "Y right-clicks,Right stick scrolls,X quick act" | "Y acts as the right mouse button at the cursor (in Overlook, inspecting an item)"; "The right stick scrolls the list or panel under the cursor"; "X does a window's quick action at the cursor" |
| "Where should the gauntlet replace the system cursor?" | "Game and Test Ground (Recommended)" | "Everywhere a player plays; the editor keeps the system cursor." |

## What it settles

- In a window the pad's left stick moves a cursor with DFO's feel; the cross still steps the focus from press to
  press and carries the cursor onto each ([[Interface]], "The pad's cursor"; [[Pick - Pad Cursor and Gauntlet]]).
- A presses at the cursor and B goes back; Y is the right mouse button there, X the window's quick action there, and
  the right stick scrolls what is under it.
- DFO's own gauntlet, its point and press frames, is the mouse's pointer and the pad cursor's picture, in the game and
  the Test Ground. The World Editor keeps the system's pointers. Daggerfall Unity's blue arrow stays behind.
- It replaces in part [[Every Control Can Be Rebound, and the Pad Plays as Destiny's]]: in a window the left stick
  no longer moves the focus.

## Claude's calls

| Call | Chosen | Why |
|---|---|---|
| Settings | None: no speed, assist or on-off switch; the speed is DFO's at its defaults | The port works without one |
| X's quick action | A press with Shift at the cursor, as the interface has it: on a press, the press; on a field, its selection grown to the cursor | Overlook's interface has no quick action of its own, and its click already wears, takes off or buys what it is on, as DFO's X did |
| Y, X and the right stick with the cursor away | Y and X bring the cursor out at the focus and act there; the right stick scrolls under the focus | A player on the cross alone reaches them too |
| When the cursor comes out | The left stick thrown from rest past the game's 0.2, wherever the interface takes the pad; a stick leant as a window opens waits until it has come back | As DFO's pad goes live, and as a held button is stale across a window opening |
| Where it comes out | The focus's middle, else where the mouse last was, else the view's middle | DFO's game cursor starts at the mouse, its front door's at the focus |
| What puts it away | A real move or press of the mouse, or a key; not a move the page makes within 0.3 s of the pointer locking or letting go, nor one that goes nowhere | DFO's |
| Its size | 31 by 32 of the interface's pixels, whole texels | The interface draws pixel art whole; at a ratio of 1.5 it stands a third larger than DFO's |
| Its press frame | While A holds a press | DFO also showed it for RT, which does nothing in Overlook's windows |
| The Test Ground's view | The gauntlet, where it wore a crosshair | "Everywhere a player plays" |

Links: [[Interface]], [[Pick - Pad Cursor and Gauntlet]], [[Every Control Can Be Rebound, and the Pad Plays as Destiny's]].
