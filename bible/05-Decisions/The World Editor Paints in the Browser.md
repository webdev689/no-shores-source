---
type: decision
date: 2026-11-14
status: in force
---
# The World Editor Paints in the Browser

> On where the World Editor runs and how coasts are drawn: "1. Browser 2. Paint but ill need our measurements to
> determine scale"

## What it settles

- The World Editor is a page in the browser, built like the game: TypeScript, drawing with WebGPU.
- Continents are painted with a brush, and the editor traces each coast into the layout file.
- The editor shows the measurements to judge scale by while painting ([[World Editor]]).
