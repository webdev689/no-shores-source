---
type: system
status: live
code:
  - client/src/speech/voice.ts#speakSyllable
  - client/src/speech/cast.ts#castOf
  - client/src/speech/cast.ts#scenesOf
  - client/src/speech/typing.ts#Typing
  - client/src/speech/conversation.ts#Conversation
  - client/src/speech/dialogue.ts#DialogueBox
  - client/src/speech/overheads.ts#Overheads
  - client/src/speech/place.ts#overheadPlace
  - client/src/speech/sheet.ts#wearSpeech
  - content/story/cast.json
---
# Speech

How characters speak, after fight-life's voice blurb system, as the owner asked
([[The Game Opens With a Story Mission at Sea]]): a voice made in the browser for every line, a dialogue box that
types each line as it is heard, and short barks over a speaker's head, their words alone
([[Speech Blurbs Show Their Text Without Glyphs]]). Every line keeps to [[Dialogue]].

## How it works

- **The cast.** `content/story/cast.json` names each speaker (the name shown, and their voice) and each voice's
  numbers: its lowest pitch, how far above that a syllable may land, the muffle, the volume and a syllable's length.
  A mission's scenes are lists of lines, each a speaker, the words, and, if wanted, `kind: "bark"` and an emote,
  which a scene keeps as written but nothing shows.
  `castOf` and `scenesOf` refuse a speaker without a voice, a voice whose syllable is under 0.04 s, a line by someone
  not in the cast, a line without words, an emote or kind they do not know, and a speaker, a voice or a scene named `__proto__` (the
  one key a plain object cannot keep as its own). The dialogue check in
  `cargo xtask check` refuses all of the same, besides holding every scene to [[Dialogue]]'s numbers and marks, so a
  story the speech system cannot read never passes the check.
- **One voice for everyone.** Each syllable is a buzz through two band-passes set to a vowel rolled for that syllable,
  a low-pass that muffles it, a short swell and fall, and a pan: talk heard through wind and timber rather than words
  made out. Speakers differ only by their numbers. A bark leans on each syllable, a little higher and louder.
- **Every line on screen is heard.** The typewriter drives the voice: 28 characters a second, held 0.3 s on a full
  stop, a question or a cry inside a line. A syllable sounds every syllable's length while a letter or a digit is being
  typed, never on a space or a mark, and neither a gap nor a slow frame stores up syllables to fire at once after it. With sound asleep
  or silenced, the words still show. A head with no point on the screen is silent, as its words are hidden.
- **The dialogue box** stands bottom centre, clear of the vitals and over the sea bar, in the Enhanced Plus window
  with the speaker's name in its header band, both at 22 px. A press finishes the typing, then moves on; a cutscene
  moves on by itself 1.6 s after a line is typed. A speaker whose name is empty is a voice from nowhere: no box, the
  words alone in the middle of the screen, faint. The box is laid first in the HUD, so the HUD's own layers (the
  menu, a window, the veil) stand over it, and the barks over heads stand under every layer, the box among them.
- **Barks** stand over the speaker's head, typed and voiced as the box's lines are, held a second once typed, then
  faded. A new bark over a head replaces the last.

- **Overlook's people.** The keepers speak on their screens: a greeting as it opens, thanks after a ware bought and a
  line for a player short of the price, each a one-line scene of `content/story/keepers.json` said in turn
  ([[Interface]], "The social space's counters"). Elder Maren Hale's welcome is `content/story/welcome.json`
  ([[Prologue]], "The elder's welcome").

## Limits

- The box shows no prompt to press; the caller says which key moves on.
- A line too long for the box's two rows grows the box upward rather than paging. [[Dialogue]] keeps lines to 14
  words, which fit.
- Lines are not yet shown in a speaker's portrait, and the mouth of a figure does not move with the voice.
- The voice is made to the owner's ask for fight-life's voice blurb, but that repository's source has not been
  compared against it: how closely it matches is unchecked.
