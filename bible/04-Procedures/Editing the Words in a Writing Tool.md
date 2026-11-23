---
type: procedure
---
# Editing the Words in a Writing Tool

How the game's words go out to a writing tool such as Type and come back
([[The Game's Words Go Out to Type and Come Back]]).

1. **Export.** From the repository's root, `node tools/words.mjs export words.md`. The text holds every spoken line
   (`content/story/`), every quest's name, task and goal (`content/quests/quests.json`) and the lore
   (`content/lore/lore.json`), grouped under headings. Each entry starts with its tag, `[story.welcome.welcomeMet.0 |
   Elder Maren Hale]`: the part before `|` says where the words live; what follows names the speaker or the field,
   only to read. The rules the words keep are written at its top.
2. **Edit.** Anything after a tag may change, over as many lines as it takes; the next tag or heading ends it. A
   spoken line's lines run together as it comes back; a chapter's keep their breaks and marks ([[Lore]], "The file").
   Keep each tag as it is, at the start of its line.
3. **Import.** `node tools/words.mjs import words.md --dry` says what would change: the entries changed, and any tag
   the game does not hold, any tag missing, any tag twice or left empty, and any changed line that breaks a rule a
   check holds (over 14 words spoken, a dash or an ellipsis, a bold or italic not closed). Without `--dry` it writes the
   entries changed into their files, formatted by the repository's Prettier.
4. **Check.** `cargo xtask check`, as for any change ([[Making a Change]]); the dialogue check holds the scenes to
   [[Dialogue]].

`tools/words.test.mjs` tests the tool (`node --test tools/words.test.mjs` from the root); the check does not run it.
