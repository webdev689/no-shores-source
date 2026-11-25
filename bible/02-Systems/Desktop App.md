---
type: system
status: planned
code:
  - desktop/package.json
  - desktop/src/main.ts
  - desktop/src/gameWindow.ts#openGameWindow
  - desktop/src/gameAddress.ts#gameAddress
  - desktop/src/fences.ts#staysInWindow
  - desktop/src/fences.ts#GAME_PERMISSIONS
  - desktop/src/bridge.ts#askOf
  - desktop/src/bridge.ts#infoOf
  - desktop/src/preload.cts
  - desktop/src/graphics.ts#BACKEND_SWITCHES
  - desktop/src/graphics.ts#orderOf
  - desktop/src/graphics.ts#launchFor
  - desktop/src/graphicsWatch.ts#failureIn
  - desktop/src/graphicsWatch.ts#watchGraphics
  - desktop/src/switches.ts#switchesFor
  - desktop/src/config.ts#Config
  - desktop/src/crashes.ts#goneBox
  - desktop/src/updates.ts#transportOf
  - desktop/src/updater.ts#startUpdater
  - desktop/src/windowPlace.ts#openingPlace
  - desktop/src/menu.ts#setMenu
  - desktop/release/version.ts#versionOf
  - desktop/release/publish.ts#releasePlan
  - desktop/release/icon.ts
  - client/src/desktop.ts#DesktopBridge
  - client/src/gpu.ts#gpuReportOf
  - client/src/game/desktopSettings.ts#desktopNodes
  - client/src/game/launcher/launcher.ts#openLauncher
  - client/src/game/launcher/launcherNodes.ts#launcherNode
  - client/src/game/launcher/patchNotes.ts#readNotes
  - client/src/game/launcher/servers.ts#askHealth
  - site/patchNotes.ts#patchNotesOf
  - server/health.ts#healthAnswer
  - site/worker.ts#download
  - .github/workflows/desktop.yml
---
# Desktop App

No Shores installed on Windows, macOS and Linux: the game noshores.online serves, in a window of its own, with what a
browser cannot give it ([[Browser and Desktop From the Start]],
[[The Desktop App Is Built in Full With Vulkan, on Claude's Autonomy]]). It is Electron 45
([[The Desktop App Stays on Electron]]), made after DFO Online's shell ([[Pick - Desktop App]]); every call of
Claude's is in [[The Desktop App as Claude Builds It]].

## How it works

### The game it plays

The window loads the game at `https://noshores.online/play/`, the same build a browser plays, so the app is never a
version behind the rooms ([[The Page Publishes Only After the Rooms Deploy]]) and nothing of the game is installed.
The browser's own cache and storage keep the game's files and settings under the app's data folder, as a browser
keeps them for the site. `NOSHORES_GAME_URL` points the app at another address to try a change (`npm run desktop`
with a dev server or a local build); an installed copy takes only this machine's own addresses there
(`gameAddress.ts`).

### The shell

`desktop/src/main.ts` wires the parts:

- **One copy at a time.** A second launch brings the first window forward.
- **The data folder** is `No Shores` under the system's application data, whatever the app is called later, so a
  new name never strands it, and `No Shores (dev)` for a copy run from the source; `NOSHORES_USER_DATA` moves it,
  for a run that tests the app. Beside the browser's data it holds `config.json` (`config.ts`: the graphics API
  chosen, each backend's failures and sightings, the window's place, whether updates are looked for), written whole
  or not at all, and `app.log`, the shell's log within 64 KB.
- **The window** (`gameWindow.ts`) opens where it was left while a screen still shows it, else centred at 80% of
  the main screen, at most 1920 × 1080 and at least 960 × 600, and keeps its place, maximized and whole-screen state.
  It is sandboxed, isolated from its preload, with no Node and no `<webview>`. F11 makes it whole-screen, and so does
  Alt+Enter but on a Mac, which has its own key for it; F12 and Ctrl+Shift+I open the developer tools, as in a browser.
  Windows and Linux show no menu bar; a Mac has the app, edit, view and window menus, its copy and paste among them.
- **An address not answering** (the game's, or a sign-in's on its way) is said by its host in a box the system draws,
  Try again or Quit, as the window has nothing to show. A page that stops is told, with why in the player's words,
  and restarted at the player's word; a third stop in two minutes says so. A page that stops answering is offered
  Wait, the default, or Restart, and the box goes if it answers again. Each stop of the page or the GPU's process is
  a line in `app.log`, with the card the game drew on, every line kept to one whatever a page's words hold
  (`crashes.ts`). A page that opens box after box (alert, confirm) is offered a way to stop them.
- **The fences** (`fences.ts`): the window stays on the game's pages, and on the two others a sign-in with Discord
  passes through on its way out and back ([[Accounts]], "Discord"): the accounts' `/v1/discord/` doors and
  `discord.com`. A link or address anywhere else opens in the player's browser, once a second at most, and only a web
  address with no name or password in it does. No page opens a window of its own. The game's origin alone is granted
  the pointer's lock, the whole screen, the keyboard's lock (the keys the system would take, kept for the game while it
  is whole-screen), and copying to the clipboard; nothing else is granted to any page, and a site that asks for a certificate of the player's gets none.

### The bridge

The preload (`preload.cts`) puts `noShoresDesktop` on the game's origin before its script runs, and on no other page
the window passes through; the shell answers only the game's own pages under `/play/`. The game's side is `client/src/desktop.ts`, read by the shell too, so the two speak
one set of words: what the shell tells (the app's version and platform, the graphics as chosen, launched and running,
and the update) and what the game asks (its adapter, that it drew, a graphics API, a restart, a download, the
pointer's lock). The page hands the shell's words to the game's worker at the start and as they change, and the
worker's asks to the shell (`thread/pageHost.ts`, `pageAway.ts`); in a browser there is no bridge, and every ask does
nothing. The shell hears only the game's window, from its top page on the game's pages, and checks every ask's
shape before acting on it (`bridge.ts` `askOf`).

The game tells its adapter as WebGPU gives it, or that none was given or its device would not start
(`gpu.ts` `gpuReportOf`), and that it has drawn as it starts. Where the page may not take the pointer's lock without a
press (after Escape), the shell takes it for the page.

### Graphics and Vulkan

WebGPU runs on the machine's own graphics API, and Chromium takes the switches that choose it at launch or never
([[Platform Research]], "The desktop app"):

| Platform | Backends, in Auto's order | The player chooses |
|---|---|---|
| Windows | Direct3D 12 (Chromium's own); Direct3D 11 (`use-webgpu-adapter=d3d11`, with Dawn's list that blocks every Direct3D 11 adapter lifted) | Auto, Direct3D 12 or Direct3D 11 |
| macOS | Metal | Nothing |
| Linux on Wayland | Three ways to Vulkan, in turn: Chromium's own (for Intel Gen12 and later on Mesa 22, and NVIDIA from 535.183.01); the same with entry 186 of Chromium's GPU list lifted, for every other card; and Chromium drawing on Vulkan itself (the `Vulkan` feature) | Nothing: all three are Vulkan |
| Linux on X11 | Vulkan with Chromium's own drawing on Vulkan (`Vulkan`), the only way there | Nothing |

Chromium gives WebGPU no Vulkan on Windows, and the shell lifts WebGPU's safety list wholesale
(`enable-unsafe-webgpu`), which would let a software adapter stand in unseen, only for SwiftShader's test backend, which
a launch takes only when named. Every launch also asks for the card a
laptop keeps for games, gives V8's young generation 32 MB so a crowded frame's garbage is swept half as often, and has
the adapter say its backend, type and driver (`switches.ts`).

Each launch takes the first backend in the player's order that has not failed on record under this Chromium
(`graphics.ts` `launchFor`). The watch over the launch (`graphicsWatch.ts`) fails it when WebGPU gave no adapter,
gave one that draws on the CPU, drew with another API than the one asked for by switches, could not start its device,
said nothing within a minute of asking WebGPU for it (a page slow to load is no failure of the graphics), or the
GPU's process went, or WebGPU lost the device, in the launch's first minute. A failure
is kept with the card and its driver (`vendor:device@driver`) and the Chromium version; the player is told, and the
app starts again on the next backend. With none left the player is told what to do for their platform: update the
driver, install the card's Vulkan driver, or update macOS; opening the app again then tries every backend afresh. A
failure is dropped once the card, its driver or the app's Chromium changes, so the next start tries that backend again;
choosing an API again in Settings drops its failures, for the next start (Restart now). Direct3D 11 and the second and
third ways to Vulkan may draw a blank window that no check sees: once the game has drawn, the player is asked once a
launch whether they can see it (with no backend left, a blank window is told what to do), the answer kept for that card, driver and
Chromium; Go back counts as a failure, and no answer in 20 seconds starts the next backend for that launch alone.

### The launcher

The app opens on a launcher ([[The Desktop App Opens on a Launcher in the Game's Look]]), once a run: a page loaded
again (a sign-in's return, Exit to Menu) skips it. It is drawn by the game's own interface in the menus' look, played
with keys, pad and mouse, with the world loading behind it and the title standing under it
(`client/src/game/launcher/`):

- **Its head**: the logo, and links to the website and the Discord server, opened in the player's browser; Report a
  bug goes to the Discord server, whose bugs go in #bug-reports.
- **Its left**: the patch notes, newest first. Each merged pull request's "Patch notes" section
  ([[Making a Change]]) is read by the site's deploy into `play/patch-notes.json` (`site/patchNotes.ts`: the twelve
  latest, each a title and its lines, plain words with no markup), which the launcher reads beside the game and keeps;
  the site not answering, it shows the notes it kept, and says so. A note merged since the player last pressed Play
  is marked new as the menu marks what is new, with the count in its heading.
- **Its right**: the servers Play joins, the rooms (`/health`, `server/health.ts`) and the accounts (`/v1/health`),
  each asked and timed as it opens and every 30 s, up, not answering after 5 s, or being asked; then the graphics
  exactly as Settings' Graphics tab has them (the resolution, and the App part below).
- **Its foot**: what the servers say, and Play, which has the focus as it opens. Play keeps the time, for the next
  launch's new notes, and goes to the title, which hears the page only from then on (a pad's button held from Play
  taps nothing).

While the launcher stands, the interface hears the page's input as the world loads, which it otherwise throws away
until the game's own frames begin.

### Settings' App part

In the app, Settings' Graphics tab ([[Interface]], "Settings") adds an App part (`desktopSettings.ts`): the graphics
API where there is a choice (Windows), what the app draws with and on which card, a choice whose every way failed on
this card, what a restart would bring, the version, and the update, with Restart now, Download, or both. The launcher
shows the same.

### Updates

The game updates with the site. The shell updates through electron-updater from the feed at
`https://noshores.online/download/` (`updates.ts`, `updater.ts`): an installed Windows copy, an AppImage run as one, the
Debian package and a Mac app a developer signed download an update in the background, a little after the start and
every hour while none is downloading or waiting (a newer one found would empty the folder holding it), and install it
as the app closes, or at once with Restart now; a download that hears nothing for two minutes is given up for the next
check. An install that leaves the app open for 30 s (a Debian package's password refused) is given up for that run:
Restart restarts, and closing asks nothing. A restart for the graphics installs a downloaded update on its way. An
AppImage is saved with no version in its name, so each update replaces it in place and its shortcuts hold. A Mac app
signed by nobody cannot replace itself, so Settings says the version is out and Download opens it. A copy run from the
source, packed without a release, or a Linux folder unpacked by hand never looks: only the release names the feed when
it packs (`desktop.yml`), so a trial pack's update file names none (`updates.ts` `followsFeed`).

### Releases and downloads

A release is cut by hand from `main`, and only on the owner's yes ([[Ask Before Deploying]]), by `desktop.yml`:

1. Its commit must have passed the CI check. Its version is the commit's UTC time, `year.monthday.hourminute`
   (`2026.1125.1230`; `release/version.ts`), never bumped by hand ([[Versions Are Not Counters]]), and must be after
   the one published; a feed that answers anything but itself or "not found" stops the release.
2. Each platform's installers are packed on its own runner, which holds no Cloudflare token: the Windows installer
   (per user, its folder chosen), a disk image and a zip for each Mac (Apple silicon and Intel), and an AppImage and
   a Debian package for Linux, packed apart and their feeds made one (`release/publish.ts` `mergeFeeds`), as a Debian
   package marks the folder it is packed from, which would set an AppImage packed beside it updating as a package.
   The icon is drawn by the site's own code, as the Discord server's is (`release/icon.ts`). A Mac signing key set
   without the notarizing key stops the release, as a Mac refuses an app signed but not notarized. Electron's fuses are set: no running as Node, no Node options or inspector from outside, the
   app's archive checked against its hash and the only code loaded; on a Mac the app is then signed ad hoc again, as
   setting them breaks the signature it had.
3. Only when every installer is there (`release/publish.ts`) are they put on R2 under `desktop/`, then `latest.json`,
   then the feeds, so no copy reads a feed that names a file not yet there.

`site/worker.ts` answers `noshores.online/download/` from there ([[Website]]): a release's files by name, kept for
good, each read in one range at a time; the feeds read afresh; and `windows`, `mac-arm64`, `mac-x64`,
`linux-appimage` and `linux-deb`, the names that never move, sent to the newest of each. It runs for `/download/`
alone; every other address is the site's static files.

Where the repository holds a developer's keys, the release signs with them: `MAC_CSC_LINK` and
`MAC_CSC_KEY_PASSWORD` for a Mac's Developer ID, notarized with `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER`; `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for Windows. Without them the Windows installer is
unsigned, and the Mac app signed ad hoc, so it opens from System Settings, Privacy & Security, rather than being
called damaged.

### Running it

| Command | What it does |
|---|---|
| `npm run desktop` | Builds the shell and the icon into `desktop/out/` (not in git) and runs the app on the live game; with `NOSHORES_GAME_URL=http://localhost:5173/` on a dev server |
| `npm ci --prefix desktop` | Installs the packing tools (electron-builder), once |
| `cd desktop && npx electron-builder --linux AppImage deb --publish never` | Packs installers into `desktop/out/release/`, after `npm run desktop:build`, with no feed to update from |
| `NOSHORES_GRAPHICS=swiftshader` | One launch on the CPU's WebGPU, for a machine with no GPU (tests) |

A pull request that changes the app, and each push to `main` that does, packs it for Linux and starts the packed app
on the game's own build, on SwiftShader, until its log says the game's adapter came up (`desktop.yml`).

## Limits

- **Not yet seen on a real GPU or a real desktop.** Tested offline in a Linux container with no GPU: the shell, the
  bridge, the fences, the watch, the keys and Settings' App part ran in Electron on SwiftShader, and the packed
  AppImage's main and preload ran from its archive. Unseen: Direct3D 12 and 11 on a Windows card, Metal, Vulkan on a
  Linux card through any of its three ways, the blank-window question over a truly blank window, an installer, an
  update installed, and a sign-in with Discord in the window.
- **SwiftShader cannot present the game's canvas from its worker**, so the game's own device is lost seconds in on a
  machine with no GPU, in a bare Electron as in headless Chromium; a picture of the game in the app there is taken by
  having the game draw into a texture of its own, which the picture is read from.
- **Unsigned installers** meet Windows' "Windows protected your PC" and a Mac's Privacy & Security until the owner
  holds signing keys ([[Open Questions]]).
- **AMD and other cards on Linux** reach Vulkan only with entry 186 of Chromium's GPU list lifted, on Wayland, or with
  Chromium drawing on Vulkan itself; for that last way, an open Electron report has one AMD card crash when an app
  draws to offscreen windows, which the game does not.
- **The site's download links** are not yet on the website, whose words are the owner's ([[Open Questions]]).
- **The AppImage may not start on Ubuntu 23.10 and later**, which keep an app from making the sandbox Chromium needs
  unless an AppArmor profile allows it. The Debian package installs that profile; an AppImage cannot (unchecked on a
  real Ubuntu). Its player is better served by the Debian package.
- **WebGPU's developer features are on for every page in the window**, Discord's sign-in pages too: they give the
  watch the backend, card type and driver it judges a launch by, and give a page timers finer than a browser's.
