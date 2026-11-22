---
type: pick
area: Network and Platform
verdict: Clean law, Cut panel
effort: M
status: ported
dfo_paths:
  - src/net/chat.js
  - src/net/chatCommands.js
  - src/net/wire.js
  - src/net/nameFilter.js
  - src/ui/chatPanel.js
  - src/ui/chatColours.js
  - server/src/index.js
dfo_commit: 1c0fd681 (main)
---
# Pick - Chat

DFO's text chat: its channels and their reach, its slash commands, its line cleaning and word stars, its rate limits,
and its panel with a peek of the newest lines while it is shut. The owner approved it: "I want to port over the chat
system from DFO, but simplify and redesign it around the next reference shown. With only local, world, and whisper.
No lobby player listing" ([[Chat Comes From DFO With Local, World and Whisper]]).

## What comes over

- Local and World, their reach (Local as far as a name over a head reads, 60 m, and its own lines always), World's
  budget of 20 lines a second, and the commands that name them.
- The line law: 240 characters, the cleaning of hidden marks and space, two lines a second in a burst of two, twenty
  refused in a row closing the socket.
- Stars over a caught word, letter for letter, so a line never grows.
- The panel's keeping and peek: 200 lines kept, the newest five shown while shut, each 20 s, fading over its last
  quarter in twentieths; the colours of each channel and each name.

## What stays behind

- Every other channel: Region, languages, Trade, LFG, party, guild and staff.
- The list of a channel's players beside its lines, `/find`, `/who` and `/search`.
- Item links, emoji, gestures, `/me`, `/rp`, `/roll`, the code of conduct card, new-voice pacing, signed line stamps,
  reports of lines and moderators' mutes.
- DFO's relay rooms: the hall is the accounts' own Durable Object.

## Our version

- A Whisper and `/r`, which DFO had none of; `/r` named DFO's regions.
- The hall judges words by Overlook's own [[Names]] judge, not DFO's lists.
- The panel redrawn after the owner's picture: a dark band between two rules, names in brackets.
- System note: [[Chat]].
