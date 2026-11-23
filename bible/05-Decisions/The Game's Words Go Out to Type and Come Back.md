---
type: decision
date: 2026-11-22
status: in force
---
# The Game's Words Go Out to Type and Come Back

The owner wrote, of Type (type.ai), a writing tool with no API:

> "It doesnt have an api, but maybe theres a way to export all dialouge for everything in the game and run it through
> type and then.bring it back here?"

Asked what the export should hold, the owner chose "Dialogue, quests, lore": every spoken line, the quests' names,
tasks and goals, and the lore books.

## What it settles

- The game's words can be written out to one text, edited in Type, and brought back into the game
  ([[Editing the Words in a Writing Tool]]).
- The export holds the story's spoken lines, the quests' words and the lore.

## Claude's calls

The owner's to change:

- **A tag on every entry** names where its words live, so they come back to their place however the text is edited;
  a tag broken, dropped or left empty changes nothing and is named.
- **Only words that changed are written**, each file formatted as the repository formats it, and the dialogue's
  checks then run as on any change ([[Dialogue]]).
- **Words written in the code**, not in `content/`, are left out.
