---
type: decision
date: 2026-11-21
status: in force
---
# Claude Makes the Four Points' Open Calls

> "Make the best decision. Do a deep detailed audit on this and ensure its 100%"

Said in answer to the questions the four points left open ([[The Interface Uses No HTML, Now or Later]],
[[Work Leaves the Main Thread Where It Can]], [[The Network Is Made Smaller and Readied for WebTransport]]).

## What it settles

- Each open question is Claude's to decide, recorded below as Claude's call for the owner to change.
- The work is audited deeply and finished whole.

## Claude's calls

| Asked | Chosen | Why |
|---|---|---|
| Where the work goes | One pull request of its own from its branch, which holds #112's work too, merged with `main` first | One change, one pull request; #112's work is part of it |
| Signing in without a password manager's fill | Chromium's own store, through the browser's credential manager: a sign-in that works is offered to be kept, and a kept one fills the drawn fields; no passkeys for now | It brings back what the drawn fields lost with no new sign-in on the rooms' server; passkeys would be a new way to sign in, a security change of its own |
| A WebTransport relay outside Cloudflare | None for now | No Cloudflare product accepts WebTransport, and a relay is a server, a cost and keys of its own; the rooms are readied for it, and their lag and loss are measured to show when it would help |
| The game's files at an address of their own | Not until the owner has a domain on Cloudflare; then the bucket's own domain, one address changed | `r2.dev` is meant for development, but a domain of the owner's own is the only fix that needs no server in front |
| The layer check's widening | It stands: the layers that draw a screen may import `ui`, and `thread` imports `ui` | The drawn interface is the one way any layer shows a screen |
| Shared memory or WebAssembly threads | Neither | Measured, the page's thread is busy 0.0 ms a frame with messages alone; shared memory needs headers GitHub Pages cannot send |
