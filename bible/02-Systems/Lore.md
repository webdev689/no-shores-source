---
type: system
status: live
code:
  - content/lore/lore.json
  - crates/gear/src/lore.rs#LoreDef
  - crates/gear/src/lore.rs#find_lore_due
  - crates/room/src/lore.rs#lore_lying
  - crates/room/src/lore.rs#find_lore
  - client/src/game/compendium/loreBook.ts#shelfOf
  - client/src/game/compendium/lore.ts#Lore
  - client/src/game/compendium/compendiumPage.ts#Compendium
  - client/src/game/compendium/loreArt.ts#coverSvg
---
# Lore

The lore books, after Destiny's ([[The Compendium Holds the Lore Books, After Destiny's]]): books in categories, each
of several chapters, each chapter found once, through the world, through a quest or through the story, and read in the
menu's Compendium ([[Interface]], "Compendium"). The rules keep what each player has found; the page shows it, and keeps
what they have read.

## The file

`content/lore/lore.json` holds:

- **Categories**, each a tile on the Compendium's front: an id, a name and a motif (one of the emblems' signs,
  `emblemMotifs.ts`).
- **Books**, each in a category: an id, a name, a cover (its cloth's colour, `#rrggbb`, and a motif) and its chapters
  in reading order.
- **Chapters**: an id, a title, the words and where it is found (`found`). The words are blocks apart by a blank line,
  each block's lines kept as they stand, and set out ([[The Lore Is Set Out, Bold and Italic Where It Helps]]):
  `**bold**` and `*italic*`; a block whose every line starts `>` a document, set in; `~` alone a break. Where it is
  found:
  - `story`: as the story ends.
  - `quest`: as a quest's task is done, the quest's id and the task's ([[Quests]]).
  - `place`: lying in the world, at a place of a node as its layout names it (as a quest's goals name them), `at`
    metres from its middle at `bearing` degrees clockwise from north, as a puzzle's point stands.

It holds the houses' three books ([[Each House's Lore Book Tells Its Art's Origin]]), in one category, "The Three
Houses":

| Book | House | Cover | Found |
|---|---|---|---|
| The Old Beacon Rolls | Stormcallers | storm blue, the bolt | a chapter for each task of "The Stolen Storm" |
| The Keeper's Hours | Lamplighters | dark amber, the lantern | a chapter for each task of "The Keeper's Lamp" |
| Unwritten | The Veiled | dusk purple, the moon | a chapter for each task of "What the Tithe Writes" |

Each book's eleven chapters come one as each task of its road is done, in the road's order, the last as the road ends.
Together they tell where each Art came from. Its words keep to the owner's: no em or en dashes; and every bold and
italic is closed, a document's every line set in and a break alone, or a check fails.

## In the rules

- **Kept by id.** A character keeps each chapter found by its book's id and its own (`book/chapter`), in the order
  found, each once; one the file no longer holds is kept as read, so it comes back with its chapter. Never change an
  id once a chapter is played.
- **The story's and the quests'.** A chapter is the player's as the story ends and as its task is done; and, as every
  ask ends and as a character is read, every chapter of the story played or of a task done is theirs, so one the file
  gives to the story or a task later reaches those who passed it.
- **Lying in the world.** A node's room lays each chapter its file places there, at the bearing and distance from its
  place's middle; one at a place the node does not hold lies nowhere. Each player who has not found it is shown it.
  A player alive within 2.5 m of it finds it (ask 74); out of reach, dead, already found or in another node, it is
  refused. It is shown and found only while the room holds the player's own character: never on a page playing
  alone, nor before a signed-in player's kept character has come. A chapter the room gave before then (the story's)
  is carried into it, as the story is.
- **Checked.** Each house's book gives a chapter for every task of its road, in its order, and walking a road
  through the rules leaves its character holding exactly the chapters of the tasks done. The file's ids are unique and hold no `/`, each category has a book and each book a chapter, each
  book's category is one of its own, each quest and task named is one, and each chapter laid in the world lies at a
  node the world holds, at a place that node holds, inside its ring, as the bake lays it. The file is hashed into the
  protocol's version (`tools/numbered.json`), as chapters cross the wire by their place in it.

## On the wire

The gear message carries the chapters found by their numbers (each its place in the file, book by book) and, in a
node, those lying there not yet found, each its number and its x and y. Ask 74 finds a chapter lying there, its
number in `item`.

## In the browser

- **In the world**, a chapter lying for the player floats as a closed book in a brass binding, its clasp lit, 0.9 m
  over where it lies under a mark's foot, laid among the marks over what a player can use ([[Game]], "Over what a
  player can use"); E within its reach says "Read" and the book's name.
- **Found**, a toast says "Lore found:", the book and the chapter. What a character already held when its first word
  on an account came is not toasted, nor a room's own starting character's.
- **Read** is kept in the browser for the account (`overlook.lore.read.<account>`); a chapter is read as the
  Compendium shows it. A chapter found and unread wears Destiny's small diamond, as do its book, its category's tile
  and the Compendium's tab.
- **The Compendium** shows it all ([[Interface]], "Compendium").

## Limits

- **Online only.** A page playing alone keeps no character, so no lore lies for it and it finds none, as it walks no
  road ([[Quests]]).
- **Read in one browser.** Another browser, or a cleared one, shows every chapter found as new again.
