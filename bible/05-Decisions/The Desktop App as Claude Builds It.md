---
type: decision
date: 2026-11-25
status: in force
---
# The Desktop App as Claude Builds It

> "Take autonomy, be extremely detailed, and do even better than DFO."

## What it settles

Claude's choices for the [[Desktop App]] ([[The Desktop App Is Built in Full With Vulkan, on Claude's Autonomy]]). The
owner can change any of them.

| Choice | Chosen | Why |
|---|---|---|
| Where the game comes from | The window plays the game at `noshores.online/play/`; the installer holds the shell alone | Every merge publishes the page, and the rooms' protocol is named by a hash of what it carries, so a game packed into an installer would stop joining after nearly every merge. DFO packed its game and had to build a channel that fetched only the files that changed; here there is nothing to fetch, and the game is never a version behind |
| A launcher window | Replaced by the owner's [[The Desktop App Opens on a Launcher in the Game's Look]] | — |
| Vulkan | WebGPU on Vulkan wherever Chromium runs it there, Linux: Chromium's own way, the same past blocklist entry 186, and Chromium drawing on Vulkan, tried in turn | Chromium gives WebGPU no Vulkan on Windows (read in Electron 45's Chromium); on Linux Vulkan is WebGPU's only API, and each of the three ways reaches cards or desktops the others do not |
| Windows | Direct3D 12, then Direct3D 11 | The only APIs Chromium's WebGPU has there; Direct3D 11 reaches older cards Direct3D 12 refuses |
| Guarding a backend | DFO's guard rebuilt for WebGPU: failures kept by card, driver and Chromium, the next backend tried, and the player asked whether they see the game where a backend may draw blank | DFO's guard held its Vulkan opt-in safe on players' machines; the game now says what adapter it got, so no second probe is needed |
| WebGPU's safety lists | Lifted wholesale (`enable-unsafe-webgpu`) only for SwiftShader's test backend, taken only when named; a Direct3D 11 launch lifts Dawn's adapter list (`adapter_blocklist`, the whole list on that launch, its software adapters caught by the watch), and the second Wayland way entry 186 of Chromium's GPU list | Lifting them wholesale lets a software adapter stand in unseen, and exposes WebGPU's unsafe features to a page from the web |
| WebGPU's developer features | On for every launch, so every page in the window | The watch judges a launch by the backend, card type and driver they give; they also give a page finer timers |
| How long the watch waits | 60 s for the game's word on its graphics after it asks WebGPU, 60 s in which a GPU lost fails the launch, 20 s for the player's answer to "Can you see the game?" | Long enough for a slow machine, short enough that a blank window is not left standing |
| How often updates are looked for | 15 s after the start, then hourly while none is downloading or waiting; a download silent 2 minutes, or an install that leaves the app open 30 s, is given up | Updates are rare, and a check mid-download would empty the folder holding the one in hand |
| The game's window | Sandboxed and isolated, no Node, no `<webview>`, one window | The window loads the web; its bridge does nothing but tell and ask, so it needs no files or Node, unlike DFO's |
| Signing in with Discord | Inside the window, through the accounts' Discord doors and Discord, as a browser's tab does | The accounts already send the player back to the game's page; a sign-in in the player's browser would need a new way back into the app |
| Permissions | The pointer's lock, the whole screen, the keys the system would take while it is whole, and copying, for the game alone | What the game uses; Electron grants everything to every page unless told otherwise |
| Keys | F11 and Alt+Enter whole-screen, F12 and Ctrl+Shift+I the developer tools, no menu bar but on a Mac | A browser's keys, which the game leaves to the browser; DFO's owner kept the developer tools for players' reports |
| Updates | electron-updater, installing as the app closes, or at once from Settings; a copy that cannot install itself is told and downloads | The game updates with the site, so the shell's own updates are rare and need no screen of their own |
| Where installers live | R2 under `desktop/`, answered at `noshores.online/download/` by the site's Worker | The repository is private, so GitHub's releases cannot serve players; a host on the game's own domain can move behind the same address, which installed copies keep asking |
| Versions | The release commit's UTC time, `year.monthday.hourminute` | [[Versions Are Not Counters]]: worked out from what it describes, never bumped by hand, and still ordered and small enough for Windows |
| Releases | By hand from `main` only, after the commit's CI check, all platforms or none | [[Ask Before Deploying]]; DFO's half-published releases taught it to publish whole |
| Installers | Windows (x64): an installer per user whose folder can be chosen, with a desktop shortcut, leaving the player's data when uninstalled; Mac: a disk image and a zip, Apple silicon and Intel, listed among role-playing games; Linux (x64): an AppImage and a Debian package | Each updates itself but a Mac app no developer signed; DFO's portable Windows build needed a swap of its own to update |
| Hardening | Electron's fuses: no running as Node, no outside Node options or inspector, the archive checked and the only code run, cookies encrypted | They close the doors an installed copy does not need, at no cost |
| The icon | The Discord server's icon, drawn by the site's own code at build time | One mark for the app, the site and the server, and no picture in git |
| The app's id and data folder | `online.noshores.app` and `No Shores`, never to change | DFO's lesson: a changed id loses every installed copy's updates, and a changed folder strands their settings |
| Settings' App part | Under Graphics: the API, what the app draws with on which card, the version and the update | Where a player looks for graphics; shown only in the app |

[[Desktop App]], [[Platform Research]].
