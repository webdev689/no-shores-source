---
type: system
status: live
code:
  - server/accounts/chatLaw.ts#readTyped
  - server/accounts/chatLaw.ts#cleanLine
  - server/accounts/chatHall.ts#Hall
  - server/accounts/chatHall.ts#starred
  - server/accounts/chat.ts#ChatHall
  - client/src/game/social/chatLink.ts#ChatLink
  - client/src/game/social/chatLog.ts#ChatLog
  - client/src/game/social/chatPanel.ts#ChatPanel
  - client/src/game/social/social.ts#startSocial
---
# Chat

Text chat between players, DFO's cut to three channels ([[Chat Comes From DFO With Local, World and Whisper]],
[[Pick - Chat]]): Local, heard by the players near enough; World, heard by everyone online; and a Whisper, heard by
one player alone. There is no list of who is in a channel. Claude's calls are in
[[Nameplates, the Interact Menu and Chat as Claude Shapes Them]].

## How it works

- **One hall.** The chat is a Durable Object of the [[Accounts]]' Worker, `ChatHall`, one for the whole game, reached at
  `/v1/chat` by WebSocket (`AccountLink.chatAt`). A socket's first message is its session's token, within five
  seconds (`TOKEN_WAIT_MS`), or it is closed with 4003 and "Sign in to chat."; then the hall welcomes it with the
  player's username. It holds 2,048 sockets. Each message after the token is JSON: `{"say", "channel", "to"}`, a
  Whisper's `to` a username; anything else, or a message past 2 KB, closes the socket.
- **Who may speak.** A guest hears Local and World but has no name to speak with, and is told "Add a username in
  Settings to chat.".
- **Local** goes to everyone whose character the same room holds, or the sea's word says is there (the Roster's
  `place`, asked again at most every 5 s), and the page keeps a line only from a player whose figure stands within
  60 m across the ground, as far as a name over a head reads, and its own always. A speaker the page cannot place is
  not heard, so at sea, where no figures stand, only the player's own Local lines show.
- **World** goes to everyone signed in, at most 20 lines a second across the whole game; a line past that is dropped.
- **A Whisper** goes to every socket of the player named, and back to the speaker's. One not online is said so
  ("Bob is not online."); one who blocks the speaker is answered as sent, and it never arrives; one the speaker blocks
  is told to be unblocked in Settings first. `/r` answers the last who whispered.
- **Blocks.** No line reaches a player who blocks its speaker, or whom its speaker blocks (kept 30 s at a time).
- **Clean lines.** Each line is cleaned at both ends (`cleanLine`): control characters and marks that turn the text's
  direction taken out, runs of space made one, trimmed, and cut at 240 characters, never through a pair's halves.
  The hall stars each word holding a blocked word letter for letter, by the [[Names]] judge, and refuses a line that
  spells one across its words ("That line is not allowed.").
- **Two a second.** A socket may say two lines a second, two in a burst; past that a line is refused ("You are sending
  lines too quickly."), and twenty refused in a row close the socket.
- **The page** joins the hall once the game boots, with the session's token, and joins again when it closes, after
  2 s and twice as long each time up to 30 s, or afresh when the account changes; a close the hall gives a reason
  (4003) is said and not joined again. A page playing alone has no hall: what it types is answered "You are playing
  alone: no one hears the chat.".

## The panel

- **The look** is the owner's picture's: a dark band between two thin light rules at the bottom left, 440 px wide at
  most, its foot 250 px over the view's (340 px at the larger step), each line its speaker's name in brackets and their
  words. A World line starts `[World]`; a Whisper reads `[Ada] whispers: …`, or `To [Ada]: …` for the player's own.
- **Colours** are DFO's: Local's words `#c4beb2`, World's `#f6f2ea`, a Whisper's `#ffaad4`, a notice `#8fb8d8`; a name
  `#e8cf86` for the player's own, the company's green for a member, `#8fd0ff` for a friend, `#f4b86c` for anyone else.
- **Shut**, it shows the newest five lines, each whole for 15 s and then fading out over 5 s, in steps of a twentieth,
  the band fading with its newest line. It keeps the newest 200 lines.
- **Open** (Chat, Enter on foot), it shows the newest 12 and a field, its channel before it ("Local:", "World:", or
  "To Ada:"), and holds the keys while it is open. Enter says the line and shuts it, an empty Enter or Escape shuts it,
  Tab turns the channel between Local and World, and the up and down arrows read back twelve lines at a time.
- **Commands**: `/l`, `/local`, `/s`, `/say` (Local); `/g`, `/world` (World); `/w`, `/whisper`, `/tell` and a name
  (a Whisper); `/r`, `/reply`; `/help` or `/?` lists them; `//` says the rest as typed. A channel's command with
  nothing after it sets the field to that channel. One that is none says "There is no /x command. /help lists them."
  and keeps the line in the field.
- **Whisper** in a player's interact menu opens the field set to whisper to them ([[Interface]], "Players").

## Limits

- Local at sea reaches no one else, since no figures stand there to be placed.
- There is no muting or reporting a line yet; blocking hides a player's lines.
- The chat opens on foot only: at the helm Enter sets sail, and the pad has no button for it.
- A player who adds a username mid-session speaks with it once the page joins the hall again (the account's change
  starts it afresh); their plate over their head shows it from their next room.
- Not yet tried live: tested offline (the hall, the law, the link and the log), and pictured headless.
