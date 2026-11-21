---
type: pick
area: Presentation and Tooling
verdict: Clean
effort: M
status: ported
dfo_paths:
  - src/systems/padCursor.js
  - src/ui/gamepadInput.js (the cursor's part)
  - src/ui/plus/plusPad.js (the cross's jump and the scroll)
  - src/ui/menu/menuPad.js (the front door's cursor)
  - src/ui/plus/plusCursor.js
dfo_commit: 1c0fd681 (main)
---
# Pick - Pad Cursor and Gauntlet

DFO's controller cursor in its windows, and the grey gauntlet its Enhanced Plus skin wears as the mouse's pointer. The
owner approved it: "implement a navigation cursor for controller (like how DFO does it) and port over the cursor
visual from DFO for the mouse", and chose how ([[The Pad Moves a Cursor in Windows, and the Gauntlet Is the Pointer]]).
The gauntlet is DFO's own pixel art, so it may come ([[Own Work]]); the Enhanced Plus UI pick brought `src/ui/plus/`
already ([[Pick - Enhanced Plus UI]]).

## What comes over

- The cursor's feel (`padCursor.js`): the curve, the ramp and its dead stop, the boost, the friction over a control,
  the pull onto its middle and the pull's target, with every number and the cases its tests checked.
- The pad in a window (`gamepadInput.js`, `plusPad.js`, `menuPad.js`): the left stick moves the cursor, A goes down
  at it and up as it is let go, B goes back, the cross steps and carries the cursor, Y right-clicks, X acts, the right
  stick scrolls under it; a move of the mouse or a key puts it away, but not a move within 0.3 s of a lock change.
- The gauntlet (`plusCursor.js`): its point and press frames, 31 by 32 pixel for pixel, the hot spot at the top left,
  a 2x form, and the press frame while a mouse button is down (not locked, not a touch).

## What stays behind

- Daggerfall Unity's linear step (`cursorStep`), the assist switch, the speed settings and the gauntlet's switch.
- Daggerfall Unity's blue arrow (`cursor.js`) and DFO's classic skin.
- The DOM: the cursor as an element, synthetic pointer events, the hover ring, the selectors that found controls,
  the prompt bar naming the buttons, and the slot for canvas windows' buttons.
- The lock-pick's cross and X, and the map the cross opened.

## Our version

Drawn by the interface, last of all, in the page and the game's worker alike (`client/src/ui/padCursor.ts`,
`gauntlet.ts`; [[Interface]], "The pad's cursor" and "The pointer and the ratio"). Every press the pad can reach in
the top window pulls it, so the pull works in every window. Lengths are DFO's CSS pixels turned into the interface's.
The stick's rest is the game's 0.2, not DFO's 0.1 after a 0.19 clip. What it is over is lit with its own brass, not a
ring. The cross keeps Overlook's repeat (0.4 s, then every 0.12 s). The gauntlet is a grid of its five colours in
code, not a PNG; the mouse wears it as an SVG at 1x and 2x. The pad cursor's press frame shows while A holds, not RT.
