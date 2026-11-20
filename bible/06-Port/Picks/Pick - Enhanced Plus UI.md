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
  - src/ui/barLoss.js
  - src/ui/hud/hudFoeTarget.js
  - src/ui/nameCone.js
  - src/ui/hitNumbers.js
  - src/ui/naval/navalHud.js
  - src/ui/profileBadge.js
  - src/scenes/naval/navalHost.js
dfo_commit: b172380aa7 (ccr-aff93cb4-gw1nto-audit); the health bars, compass and HUD places fc2a8e6, on the same
  branch; the profile mark read at 1c0fd681 (main)
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
- What the HUD's health bars do: a loss's strip and the piece a bite breaks off (`barLoss.js`), the target bar's foe,
  its fade, its memory of each foe and its poise track (`enhancedHud.js`, `hudFoeTarget.js`, the track's reading in
  `src/ai/tactics.js`), the names' cone, size and sight over figures (`nameCone.js`, `src/net/remotePlayers.js`),
  the damage numbers' words and rise (`hitNumbers.js`), the vitals at rest (`src/ui/uiCalmStyle.js`) and the sea
  card's hull losses (`navalHud.js`), with the cases their tests pinned.

## What stays behind

- What the windows read of Daggerfall's and Morrowind's data: item templates and counts, Morrowind bodies, classic
  art. A window comes over once our own data stands in its place ([[Our Own Keys for Materials, Places and Items]]).
- The classic service windows the Enhanced skin dresses (`enhancedPort.js`, `enhancedPorts.js`).
- The Grimoire skin, which dresses the windows with a third-party art pack.
- The foe bar's blade face, another person's picture, not our own work.
- The bars' readings of Daggerfall's rules: the classic vitals (`hudVitals.js`), magicka and breath, and a number's
  critical strike, backstab, miss and ward; a heal's number, since no player heals yet; and a boss's traits and ward,
  which our foes do not have.
- The bearing DFO's compass marks took from Daggerfall Unity's compass (`compassMarkerLerp` in `hud.js`). Ours is
  written from the strip's own law, and puts a mark on the same quarter turn as the points, so it stands under its
  letter; DFO's spread its marks over half a turn.

## Our version

The compass and the bars' places come over at the owner's word
([[The Player's Display Takes DFO's Compass and Bar Layout]]): the compass across the top's middle with the boss bar and
the target's plate under it (`enhancedHud.js` and its sheets), on the [[Test Ground]] and in the [[Game]] on foot and at
sea. Of the compass's marks, the sea's ships come over (`navalHost.js`, `compassShips`). The rest have no like here yet:
the player's own boats on land, a party, a quest, the way out, a profession's nodes, Detect spells, and the world's
events (a gate, a breach's arch, the sea serpent, a Hollow, a fallen star). The vitals stand at the top left and the
Arts and weapons at the bottom left, after the owner's own pictures
([[The Vitals Go Top Left and the Arts and Weapons Bottom Left]]).

The style kit and its frame are the [[Interface]]'s roles, and the [[Game]]'s heads-up display wears them
([[The Ship Is Managed and Walked From the Sea's Panel]]). The health bars are ported: the vitals, the target plate
and the boss bar, the plates over foes and ships' plates do what Enhanced Plus does with them ([[Interface]],
[[Enemies]], [[Plates Stay Light and Bars Do What Enhanced Plus Does]]). The main menu's profile mark
(`profileBadge.js` and its style in `enhancedStyle.js`) is the menu's account mark, in its top line
([[The HUD Drops Its Room Line, and the Account Mark Comes From DFO]]). The themes, the pad, the touch layer and the
windows have not come over.
