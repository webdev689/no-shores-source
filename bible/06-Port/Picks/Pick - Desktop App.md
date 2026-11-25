---
type: pick
area: Network and Platform
verdict: Cut
effort: M
status: ported
dfo_paths:
  - app/main.cjs
  - app/preload.cjs
  - app/lib/graphicsBackend.cjs
  - app/lib/autoUpdate.cjs
  - app/lib/updateCheck.cjs
  - app/lib/rendererGone.cjs
  - app/lib/shellDialogs.cjs
  - app/lib/frameRate.cjs
  - app/package.json
  - app/afterPack.cjs
  - .github/workflows/release-desktop.yml
  - bible/01-Overview/Desktop-App.md
dfo_commit: aee222615a862b9e428589f4f9fbeb038feffbb6
---
# Pick - Desktop App

DFO Online's Electron shell: the window over the built site, its launcher, its updater and its per-file game channel,
the Vulkan opt-in and its guard, the crash and hang answers, and the release that cut installers for three platforms.

## What comes over

- **The guard over a graphics backend**: a backend chosen by the player, its failure kept by card, driver and Chromium,
  the app started again on the default, the record dropped when one of the three changes, and the player asked
  whether they see a window a backend may draw blank. Rebuilt for WebGPU: the game's own adapter report replaces DFO's
  WebGL2 probe, and a chain of backends replaces the one opt-in.
- **The answers to a stopped page**: Restart or Quit, with the reason in the player's words and a loop of stops said,
  Wait or Restart for a page that stopped answering, each stop in a log; the safe answer is always the cancel.
- **The shell's laws**: one copy at a time; a data folder that keeps its name; a fenced window whose links go to the
  player's browser; the card a laptop keeps for games; V8's young generation at 32 MB, as DFO measured it; the Mac app
  signed ad hoc so it is never called damaged.
- **Updates**: electron-updater where a copy can replace itself, a notice where it cannot, a download that stalls given
  up, and an install asked once at most, as DFO found a second ask installed twice.
- **Releases**: a version worked out rather than bumped, every platform built before anything is published, and the
  set checked whole.

## What stays behind

- Everything that finds, judges or serves Daggerfall's ARENA2 files, and the saves kept as Daggerfall Unity's files.
- The launcher page, the per-file game channel and its store, the self-swap of the portable and Mac builds, the
  private server, the VSync switch and the GPU cache's turning: the app plays the live game and draws its interface
  in WebGPU, so none has work to do.
- Releases on every merge, patch notes in the release, and releases on GitHub: the game updates with the site, and the
  repository is private.

## Our version

[[Desktop App]], with every call of Claude's in [[The Desktop App as Claude Builds It]].
