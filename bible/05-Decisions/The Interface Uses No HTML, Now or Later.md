---
type: decision
date: 2026-11-20
status: in force
---
# The Interface Uses No HTML, Now or Later

> "I wanted to talk about and hopefully tackle a few things my friend mentioned to me." ... "4. Removing/replacing
> and refraining from using any.HTML now and in the future"

> Told the plan (the interface drawn by the game first, then work moved off the main thread, WebTransport once
> measured, Protobuf skipped) and asked four questions: "Lets do it. Take some autonomy and complete everything to
> 100%. I want you to research throughly and do this right."

For the game's interface it goes further than [[HTML Is Avoided Where It Can Be]], which still holds for the pages
Claude makes to test or measure and those Claude shares with the owner.

## What it settles

- No part of the game's interface is HTML, now or later: what is HTML today is replaced, and nothing new is built
  from it.
- The choices are Claude's, made on research ("Take some autonomy"), each recorded below as Claude's call for the
  owner to change.

## Claude's calls

- The game draws its interface in WebGPU ([[Platform Research]], "The interface"): one atlas of Pixelify Sans's
  glyphs, read from the font into its grid's cells as the page starts (with `face.ts`'s mended glyphs), and the
  kit's frames and bevels; drawn at whole multiples of its grid, unfiltered, in one instanced draw a frame; a tree of
  the game's own, laid out by a small layout of its own; focus moved by keys, pad and pointer alike.
- The page keeps one HTML file, holding the canvas and the script, as nothing can be drawn without it. The canvas
  carries a label and a role, and announcements go through `document.ariaNotify()`: neither builds interface in HTML.
- Typing goes to the canvas through `EditContext` where the browser has it (Chromium), and through keys and paste
  elsewhere; the game's own on-screen keyboard serves touch and pad. Lost: composing Chinese, Japanese or Korean
  outside Chromium, and a screen reader beyond the announcements.
- The order: the HUD, then the menus and screens, then the Test Ground and the World Editor. A check then refuses new
  HTML.
- Signing in, which a browser's password manager can no longer fill from the page: Chromium's own store, through
  the browser's credential manager; no passkeys for now ([[Claude Makes the Four Points' Open Calls]]).

[[Interface]], [[Platform Research]].
