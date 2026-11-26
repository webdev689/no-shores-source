---
type: system
status: live
code:
  - server/accounts/chatLaw.ts#readTyped
  - server/accounts/chatLaw.ts#cleanLine
  - server/accounts/chatHall.ts#Hall
  - server/accounts/chatWords.ts#starred
  - server/accounts/chatDeps.ts#hallDeps
  - server/accounts/chat.ts#ChatHall
  - client/src/game/social/chatLink.ts#ChatLink
  - client/src/game/social/chatLog.ts#ChatLog
  - client/src/game/social/chatPanel.ts#ChatPanel
  - client/src/game/social/social.ts#startSocial
---
# Chat

Text chat between players, DFO's cut to a few channels ([[Chat Comes From DFO With Local, World and Whisper]],
[[The Sea Has the Chat, Each Water a Region Channel]], [[Pick - Chat]]): Local, heard by the players near enough on
land; Region, heard by every ship in the same water at sea; World, heard by everyone online; and a Whisper, heard by
one player alone. There is no list of who is in a channel. Claude's calls are in
[[Nameplates, the Interact Menu and Chat as Claude Shapes Them]].

## How it works

- **One hall.** The chat is a Durable Object of the [[Accounts]]' Worker, `ChatHall`, one for the whole game, reached at
  `/v1/chat` by WebSocket (`AccountLink.chatAt`). A socket's first message is its session's token, within five
  seconds (`TOKEN_WAIT_MS`), or it is closed with 4003 and "Sign in to chat."; then the hall welcomes it with the
  player's username. It holds 2,048 sockets signed in and 256 more waiting for a token, one address eight waiting at
  most (`SILENT_FROM_ONE`, so no one page fills it), and one account four at most ("You are chatting in too many
  tabs."). Each session is asked again once a minute, and a socket whose session has ended is let go. Each message after
  the token is JSON: `{"say", "channel", "to"}`, a Whisper's `to` a username; anything else, or a message past 2,048
  characters, closes the socket. A socket's messages are taken one after another, so a player's lines go out in the
  order said.
- **Who may speak.** A guest hears Local, Region and World but has no name to speak with, and is told "Add a username
  in Settings to chat.".
- **Where a player is** comes from the accounts' presence: the room their character is in, and at sea the water their
  ship is in, which the room tells the accounts whenever it changes ([[Server]], [[Accounts]]). The hall asks for the
  speaker's place with each line, and for everyone else's at most every 5 s, keeping the last answer when an ask
  fails. One with no place yet is told "You are not in a place to speak in yet.", and a line the accounts could not
  answer for "That line could not be sent. Try again." (`UNSENT`).
- **Local** is for land: it goes to everyone in the same room, and the page keeps a line only from a player whose figure
  stands within 60 m across the ground, as far as a name over a head reads, and its own always; in a Breach's run from
  anyone in it, as its company calls across its spaces (the Steward's order to its taken, in shores far from its court:
  `heardLocally`). Said at sea, it is
  refused ("Local is heard on land. At sea, say it to your water with /sea.").
- **Region** is for the sea: it goes to every ship in the same water of the same sea room, and each line is marked with
  the water's name. Said on land, it is refused ("Region is heard at sea.").
- **World** goes to everyone signed in, at most 20 lines a second across the whole game; past that the speaker is told
  "World is busy. Try again in a moment.".
- **A Whisper** goes to every socket of the player named, and back to the speaker's. One not online, or a name too long
  to be anyone's, is said so ("Bob is not online."); one who blocks or mutes the speaker is answered as sent, and it
  never arrives; one the speaker blocks is told to be unblocked in Settings first; and a player cannot whisper to
  themself. `/r` answers the last who whispered.
- **Blocks and mutes.** No line reaches a player who blocks its speaker, whom its speaker blocks, or who mutes its
  speaker (each kept 30 s at a time). When the accounts cannot say who those are, the last answer kept is used, and
  with none the speaker is told the line could not be sent (`UNSENT`): a line never goes out as though no one blocked
  them. A mute is one way and hides only chat ([[A Player May Mute Another]]): the Roster
  keeps the muted, and the page hides their lines too, from the moment it mutes them.
- **Clean lines.** Each line is cleaned at both ends (`cleanLine`): control and format characters, marks that turn the
  text's direction and halves of a broken pair taken out (the joiner that builds an emoji kept), more than two marks
  stacked on a letter cut to two, runs of space made one, trimmed, and cut at 240 characters, never through a pair's
  halves; a line of nothing but blanks says nothing. The hall stars each word holding a blocked word letter for letter,
  by the [[Names]] judge, reading Cyrillic and Greek letters that look Latin as the Latin ones, and refuses a line whose
  single letters spell one out ("f u c k": "That line is not allowed."); whole words side by side ("go ok") are read
  apart.
- **Two a second.** An account may say two lines a second, two in a burst, however many sockets it holds, guests too;
  past that a line is refused ("You are sending lines too quickly."), and the twentieth refused in a row closes every
  socket of the account. What an account may still say is kept a second past its last line, so closing a socket and
  opening another gives no fresh lines.
- **The page** joins the hall once the game boots, with the session's token, and joins again when it closes or no
  session is there yet, after 2 s and twice as long each time up to 30 s, each wait a fifth longer or shorter at random,
  or afresh when the account changes; a close the hall gives a reason (4003) is said, and the page joins again only when
  the player next says a line, kept in the field ("The chat is joining. Say it again in a moment."). An account changed
  starts the chat afresh: the lines kept, whom `/r` answers and the Whisper's name go. A page playing alone has no hall:
  what it types is answered "You are playing alone: no one hears the chat.". Who is muted is the Roster's word alone,
  asked again as a mute or unmute is made.

## The panel

- **The look** is the owner's picture's: a dark band between two thin light rules at the bottom left, 440 px wide at
  most, its foot 250 px over the view's (340 px at the larger step), each line its speaker's name in brackets and their
  words. A World line starts `[World]` and a Region line its water's name (`[Lantern Sea]`); a Whisper reads
  `[Ada] whispers: …`, or `To [Ada]: …` for the player's own. A run of letters longer than 24 is broken to fit.
- **Colours** are DFO's: Local's words `#c4beb2`, Region's `#8fe28f`, World's `#f6f2ea`, a Whisper's `#ffaad4`, a
  notice `#8fb8d8`; a name `#e8cf86` for the player's own, the company's green for a member, `#8fd0ff` for a friend,
  `#f4b86c` for anyone else. The band is black at three quarters, so its lightest words read over a white sky.
- **Shut**, it shows the newest five lines, each whole for 15 s and then fading out over 5 s, in steps of a twentieth,
  the band fading with its newest line. It keeps the newest 200 lines.
- **Open** (Chat, T, on foot, at the helm and in a sea fight, while no window of the menu, a player's menu or Inspect
  is up), it shows the newest 12 lines, fewer in a view too short to keep its top 200 px clear (3 at the fewest, the
  band cut to fit, its oldest rows first), and a field, its channel before it ("Local:", the water's name, "World:",
  or "To Ada:"), and holds the keys while it is open. Enter says the line and shuts it, an empty Enter or Escape shuts
  it, Tab turns the channel between Local (Region at sea) and World, and the up and down arrows read back as many
  lines at a time as it shows. A line the page cannot send yet stays in the field.
- **At sea** the field says Region in Local's place, by its water's name, and Local's again on land.
- **Commands**: `/l`, `/local`, `/s`, `/say` (Local); `/sea`, `/region` (Region); `/g`, `/world` (World); `/w`,
  `/whisper`, `/tell` and a name (a Whisper); `/r`, `/reply`; `/mute` and `/unmute` and a name; `/help` or `/?` lists
  them; `//` says the rest as typed. A channel's command with nothing after it sets the field to that channel. One
  that is none says "There is no /x command. /help lists them." and keeps the line in the field.
- **Whisper** and **Mute** in a player's interact menu ([[Interface]], "Players"): Whisper opens the field set to whisper
  to them, and Mute mutes them (Unmute once muted). Settings lists the muted under the blocked, each with Unmute.

## Limits

- There is no reporting a line yet.
- The pad has no button for the chat.
- A mute or unmute reaches the hall's other speakers within 30 s, as it keeps whom each is kept apart from; the page
  hides or shows the lines at once.
- Not yet tried live: tested offline (the hall, the law, the hall's queries, the link and the log), and pictured
  headless.
