---
type: decision
date: 2026-11-25
status: in force
---
# The Desktop App Stays on Electron

> "Is electron the best choice? Im really trying to push this for performance"

> "Should we do rust native client?"

> Told that a native Rust client would replace the TypeScript client, and advised to measure the game's frame times
> on a real GPU first: "We stick to electron"

## What it settles

- **The [[Desktop App]] stays an Electron shell** around the game the website serves. No native client is built.
- **Performance is pushed within Electron**: the app's own Chromium, and what a shell can do that a browser tab
  cannot.

[[Desktop App]], [[The Desktop App Is Built in Full With Vulkan, on Claude's Autonomy]].
