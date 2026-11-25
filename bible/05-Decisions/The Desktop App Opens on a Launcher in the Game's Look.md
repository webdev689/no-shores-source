---
type: decision
date: 2026-11-25
status: in force
---
# The Desktop App Opens on a Launcher in the Game's Look

> "Do a comprehensive audit on this and ensure its perfect. Also ensure the launcher design is as detailed and organized
> as possible"

> Asked how No Shores' launcher should work, offered "The app opens on a launcher screen drawn by the game's own
> interface (no HTML, same pixel style and controls as the menus, works with keys, pad and mouse), then Play goes to
> the title. Everything below lives on it.": "Launcher in the game's look (Recommended)"

> Asked where the launcher's news should come from, offered "DFO's way: each pull request carries a short "Patch
> notes" section in plain words; the launcher shows the latest ones, marked new since you last played.": "Patch notes
> in each PR (Recommended)"

> Asked what else the launcher should hold: "Graphics options,Server status,Links,App and updates"

> Told that the website's Play and the app open the game with no `?room=`, which plays offline, and asked what the
> launcher's Play should do, offered "The app's Play joins the live rooms and accounts (`?room=live`), so the
> launcher's server status is what the player is about to use. The website's own Play is left as it is.": "Play
> online (Recommended)"

## What it settles

- **The [[Desktop App]] opens on a launcher**, drawn by the game's own interface, with no HTML
  ([[The Interface Uses No HTML, Now or Later]]), in the menus' look and played with keys, pad and mouse. Play goes to
  the game's title. It replaces "A launcher window: none" in [[The Desktop App as Claude Builds It]].
- **Its news is patch notes**: each pull request carries a short "Patch notes" section in plain words, and the
  launcher shows the latest, marked new since the player last played.
- **It also holds** the graphics options, the servers' status, links, and the app's version and updates.
- **The app plays online**: its Play joins the live rooms and accounts (`?room=live`). The website's own Play is left
  as it is.
- **Its design is as detailed and organized as possible.**

[[Desktop App]].
