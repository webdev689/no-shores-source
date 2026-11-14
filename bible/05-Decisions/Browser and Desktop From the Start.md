---
type: decision
date: 2026-11-14
status: in force
---
# Browser and Desktop From the Start

> "Both from the start. Whats the best option that outdoes electron"

> On the desktop wrapper: "Electron"

## What it settles

- Overlook ships in the browser and as a desktop app from the start, both from the one client build.
- The desktop app is Electron. Its bundled Chromium gives WebGPU on Windows, macOS and Linux alike
  ([[WebGPU Only]]); wrappers that use the operating system's own web view cannot promise that today.
- DFO Online's Electron shell and launcher are candidates to bring over ([[Pick List]]).
