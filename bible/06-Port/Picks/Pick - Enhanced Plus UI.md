---
type: pick
area: Presentation and Tooling
verdict: Clean kit and pad, Cut windows
effort: L
status: approved
dfo_paths:
  - src/ui/enhanced/
  - src/ui/plus/
  - src/ui/touch/
  - src/ui/menu/
  - src/ui/profileBadge.js
dfo_commit: b172380aa7 (ccr-aff93cb4-gw1nto-audit); the profile mark read at 1c0fd681 (main)
---
# Pick - Enhanced Plus UI

DFO's own interface: a style kit and window frame, the windows and HUD drawn in them, and the Plus gamepad pad. The
owner approved it: asked whether to record it as an approved pick, "yes".

## What comes over

- The style kit and frame (`enhancedStyle.js`, `enhancedPlusStyle.js`, `enhancedFrame.js`, `enhancedDialogStyle.js`,
  `enhancedPortStyle.js`), as TypeScript.
- The Plus pad, the touch layer and the menu glyphs (`src/ui/plus/`, `src/ui/touch/`, `src/ui/menu/`).
- The Enhanced windows and HUD: the main menu, HUD and hotbar, notices, dialogs and pickers, controls, account,
  character creation and sheet, talk, tavern and shop panels, player trade and the death screen. Each comes with its
  seams cut.

## What stays behind

- What the windows read of Daggerfall's and Morrowind's data: item templates and counts, Morrowind bodies, classic
  art. A window comes over once our own data stands in its place ([[Our Own Keys for Materials, Places and Items]]).
- The classic service windows the Enhanced skin dresses (`enhancedPort.js`, `enhancedPorts.js`).
- The Grimoire skin, which dresses the windows with a third-party art pack.

## Our version

The style kit and its frame are the [[Interface]]'s roles, and the [[Game]]'s heads-up display wears them
([[The Ship Is Managed and Walked From the Sea's Panel]]). The main menu's profile mark (`profileBadge.js` and its
style in `enhancedStyle.js`) is the menu's account mark, in its top line
([[The HUD Drops Its Room Line, and the Account Mark Comes From DFO]]). The themes, the pad, the touch layer and the windows have
not come over.
