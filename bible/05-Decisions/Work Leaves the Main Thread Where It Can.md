---
type: decision
date: 2026-11-20
status: in force
---
# Work Leaves the Main Thread Where It Can

> "3. When possible, offload to different threads. Refrain from putting everything on one thread" ... "When brings
> me to the single thread nature of javascript. Maybe inventing a way to use multiple threads. Im sure its possible"

> "Lets do it. Take some autonomy and complete everything to 100%. I want you to research throughly and do this
> right."

## What it settles

- Work is spread over threads wherever it can be, not all on one.
- The choices are Claude's, made on research, each recorded below as Claude's call for the owner to change.

## Claude's calls

- The browsers' own threads serve, with nothing to invent ([[Platform Research]], "Threads"): one game worker holds
  the game (its loop, the rules' prediction, the room's connection and every draw, WebGPU through an
  `OffscreenCanvas`). The main thread keeps only what a browser allows nowhere else: input, pointer lock,
  fullscreen, gamepads, sound and typing. Every browser that runs the game runs WebGPU in a worker.
- Messages first, not shared memory: shared memory needs headers GitHub Pages cannot send, and Rust's WebAssembly
  threads still need the nightly compiler. Both are measured again once the game worker stands.
- Sound stays on the main thread, its cues sent ahead by the game worker.
- Frame time, long tasks and input to frame are measured before and after.
- It is built once the interface has left HTML ([[The Interface Uses No HTML, Now or Later]]): a worker has no page.

[[Platform Research]].
